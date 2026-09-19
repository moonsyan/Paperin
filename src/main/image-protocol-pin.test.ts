import { mkdtemp, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => 'C:\\mock\\userData' }, net: {} }))

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const tempDir = async (prefix: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

describe('图片读取白名单钉住恢复', () => {
  it('恢复已钉住的目录后，换靶的 junction 不能读出根外图片', async () => {
    const { isImagePathAllowedAfterResolvingLinks, restorePinnedImageDir, allowImageDirectory } = await import('./image-protocol')
    const { realpath } = await import('fs/promises')
    const parent = await tempDir('paperin-img-pin-')
    const original = await tempDir('paperin-img-pin-in-')
    const rebound = await tempDir('paperin-img-pin-out-')
    const junction = join(parent, 'images')
    await writeFile(join(original, 'note.png'), 'png')
    await writeFile(join(rebound, 'secret.png'), 'secret')
    try {
      await symlink(original, junction, 'junction')
    } catch {
      return
    }
    const pinned = await realpath(junction)
    allowImageDirectory(junction)
    restorePinnedImageDir(junction, pinned)
    await expect(isImagePathAllowedAfterResolvingLinks(join(junction, 'note.png'))).resolves.toBe(true)
    await rm(junction, { recursive: true, force: true })
    try {
      await symlink(rebound, junction, 'junction')
    } catch {
      return
    }
    await expect(isImagePathAllowedAfterResolvingLinks(join(junction, 'secret.png'))).resolves.toBe(false)
  })
})
