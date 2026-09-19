import { lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'fs/promises'
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

  it('信任根被换成指向根外的 junction 后不再授权新目标', async () => {
    const { isResolvedPathWithinTrustedRoots, trustDirectory } = await import('./trusted-paths')
    const parent = await createTemporaryDirectory('paperin-rebind-parent-')
    const original = await createTemporaryDirectory('paperin-rebind-original-')
    const outside = await createTemporaryDirectory('paperin-rebind-outside-')
    const junction = join(parent, 'workspace')
    const originalDoc = join(original, 'inside.md')
    const outsideDoc = join(outside, 'secret.md')
    await writeFile(originalDoc, '原工作区')
    await writeFile(outsideDoc, '根外')
    try {
      await symlink(original, junction, 'junction')
    } catch {
      return
    }
    trustDirectory(junction)
    await expect(isResolvedPathWithinTrustedRoots(join(junction, 'inside.md'))).resolves.toBe(true)

    await rm(junction, { recursive: true, force: true })
    try {
      await symlink(outside, junction, 'junction')
    } catch {
      return
    }
    await expect(isResolvedPathWithinTrustedRoots(join(junction, 'secret.md'))).resolves.toBe(false)
  })
})

describe('对话框导出目标身份', () => {
  it('写盘前核对另存为选定目标的真实路径', async () => {
    const { writeIfDialogTargetStillAuthorized } = await import('./trusted-paths')
    const directory = await createTemporaryDirectory('paperin-dialog-write-')
    const target = join(directory, 'export.pdf')
    await writeFile(target, 'old')

    const written = await writeIfDialogTargetStillAuthorized(target, async (path) => {
      await writeFile(path, 'new')
    })
    expect(written).toBe('written')
    expect(await readFile(target, 'utf-8')).toBe('new')
  })

  it('目标在授权后被换成根外链接时拒绝写入', async () => {
    const { createSaveAsWriteTargetAuthorizer, writeIfDialogTargetStillAuthorized } = await import('./trusted-paths')
    const directory = await createTemporaryDirectory('paperin-dialog-swap-')
    const outside = await createTemporaryDirectory('paperin-dialog-outside-')
    const target = join(directory, 'export.pdf')
    const privateFile = join(outside, 'private.pdf')
    await writeFile(target, 'chosen')
    await writeFile(privateFile, 'secret')
    const authorizer = await createSaveAsWriteTargetAuthorizer(target)
    expect(authorizer).toBeTypeOf('function')

    await rm(target)
    let linkCreated = true
    try {
      await symlink(privateFile, target, 'file')
      linkCreated = (await lstat(target)).isSymbolicLink()
    } catch {
      linkCreated = false
    }
    if (!linkCreated) return

    const written = await writeIfDialogTargetStillAuthorized(target, async (path) => {
      await writeFile(path, 'hijacked')
    }, authorizer)
    expect(written).toBe('invalid-path')
    expect(await readFile(privateFile, 'utf-8')).toBe('secret')
  })

  it('恢复已钉住的真实根后，重启前换靶的 junction 不能扩大授权', async () => {
    const { isResolvedPathWithinTrustedRoots, restorePinnedTrustRoot, trustDirectory } = await import('./trusted-paths')
    const { realpath } = await import('fs/promises')
    const parent = await createTemporaryDirectory('paperin-pin-restore-')
    const original = await createTemporaryDirectory('paperin-pin-restore-in-')
    const rebound = await createTemporaryDirectory('paperin-pin-restore-out-')
    const junction = join(parent, 'workspace')
    await writeFile(join(original, '笔记.md'), '# 原\n')
    await writeFile(join(rebound, '秘密.md'), '# 根外\n')
    try {
      await symlink(original, junction, 'junction')
    } catch {
      return
    }
    const pinned = await realpath(junction)
    trustDirectory(junction)
    restorePinnedTrustRoot(junction, pinned)
    await expect(isResolvedPathWithinTrustedRoots(join(junction, '笔记.md'))).resolves.toBe(true)
    await rm(junction, { recursive: true, force: true })
    try {
      await symlink(rebound, junction, 'junction')
    } catch {
      return
    }
    await expect(isResolvedPathWithinTrustedRoots(join(junction, '秘密.md'))).resolves.toBe(false)
  })
})
