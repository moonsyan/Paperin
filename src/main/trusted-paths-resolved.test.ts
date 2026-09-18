import { lstat, mkdtemp, mkdir, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => 'C:\\mock\\userData' }, net: {} }))

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (prefix: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('解析后的信任根边界', () => {
  it('按已授权根的真实路径校验实际写入目标', async () => {
    const { isResolvedPathWithinTrustedRoots, trustDirectory } = await import('./trusted-paths')
    const workspace = await createTemporaryDirectory('paperin-real-root-')
    const document = join(workspace, 'inside.md')
    await writeFile(document, '工作区内容')
    trustDirectory(workspace)

    await expect(isResolvedPathWithinTrustedRoots(document)).resolves.toBe(true)
  })

  it('工作区路径为写入器提供真实目标授权校验', async () => {
    const { getWriteTargetAuthorizer, trustDirectory } = await import('./trusted-paths')
    const workspace = await createTemporaryDirectory('paperin-write-authorizer-')
    const document = join(workspace, 'inside.md')
    await writeFile(document, '工作区内容')
    trustDirectory(workspace)

    const authorizeTarget = getWriteTargetAuthorizer(document)

    expect(authorizeTarget).toBeTypeOf('function')
    await expect(authorizeTarget?.(document)).resolves.toBe(true)
  })

  it('允许真实路径仍位于已授权工作区内的文件', async () => {
    const { isPathTrustedAfterResolvingLinks, trustDirectory } = await import('./trusted-paths')
    const workspace = await createTemporaryDirectory('paperin-trusted-inside-')
    const document = join(workspace, 'inside.md')
    await writeFile(document, '工作区内容')
    trustDirectory(workspace)

    await expect(isPathTrustedAfterResolvingLinks(document)).resolves.toBe(true)
  })

  it('拒绝工作区内指向根外文件的符号链接', async () => {
    const { isPathTrustedAfterResolvingLinks, trustDirectory } = await import('./trusted-paths')
    const workspace = await createTemporaryDirectory('paperin-trusted-root-')
    const outside = await createTemporaryDirectory('paperin-trusted-outside-')
    const target = join(outside, 'private.md')
    const link = join(workspace, 'linked.md')
    await writeFile(target, '根外内容')
    await mkdir(join(workspace, 'links'))
    let linkCreated = true
    try {
      await symlink(target, link, 'file')
      linkCreated = (await lstat(link)).isSymbolicLink()
    } catch {
      linkCreated = false
    }
    if (!linkCreated) return

    trustDirectory(workspace)

    await expect(isPathTrustedAfterResolvingLinks(link)).resolves.toBe(false)
  })
})
