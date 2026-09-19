import { mkdtemp, mkdir, realpath, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  allowExportDirectory,
  isExportDirectoryAuthorized,
  resetExportDirectoriesForTests,
} from './export-dirs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  resetExportDirectoriesForTests()
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('导出目录授权', () => {
  it('只允许刚刚选定的目录，不把工作区当成导出目标', async () => {
    const picked = await mkdtemp(join(tmpdir(), 'paperin-export-pick-'))
    temporaryDirectories.push(picked)
    const workspace = await mkdtemp(join(tmpdir(), 'paperin-export-ws-'))
    temporaryDirectories.push(workspace)

    await expect(isExportDirectoryAuthorized(workspace)).resolves.toBe(false)
    await expect(allowExportDirectory(picked)).resolves.toBe(true)
    await expect(isExportDirectoryAuthorized(picked)).resolves.toBe(true)
    await expect(isExportDirectoryAuthorized(workspace)).resolves.toBe(false)
  })

  it('选定后被换成根外链接时拒绝写出', async () => {
    const picked = await mkdtemp(join(tmpdir(), 'paperin-export-swap-'))
    temporaryDirectories.push(picked)
    const outside = await mkdtemp(join(tmpdir(), 'paperin-export-out-'))
    temporaryDirectories.push(outside)
    await expect(allowExportDirectory(picked)).resolves.toBe(true)

    const parent = join(picked, '..')
    const name = picked.split(/[\\/]/).pop() ?? 'picked'
    await rm(picked, { recursive: true, force: true })
    let linked = true
    try {
      await symlink(outside, join(await realpath(parent), name), 'dir')
    } catch {
      linked = false
    }
    if (!linked) {
      await mkdir(picked, { recursive: true })
      return
    }
    await expect(isExportDirectoryAuthorized(picked)).resolves.toBe(false)
  })
})
