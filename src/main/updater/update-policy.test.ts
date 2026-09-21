import { describe, expect, it } from 'vitest'
import { shouldCheckForUpdates, shouldInstallUpdateOnQuit } from './update-policy'

describe('update-policy', () => {
  it('开发环境永不检查更新，也永不在退出时安装', () => {
    expect(shouldCheckForUpdates(true, true)).toBe(false)
    expect(shouldCheckForUpdates(true, false)).toBe(false)
    expect(shouldInstallUpdateOnQuit(true, true)).toBe(false)
    expect(shouldInstallUpdateOnQuit(true, false)).toBe(false)
  })

  it('生产环境关闭后既不联网也不在退出时安装', () => {
    expect(shouldCheckForUpdates(false, false)).toBe(false)
    expect(shouldInstallUpdateOnQuit(false, false)).toBe(false)
  })

  it('生产环境开启时检查和退出安装都是显式 true', () => {
    expect(shouldCheckForUpdates(false, true)).toBe(true)
    expect(shouldInstallUpdateOnQuit(false, true)).toBe(true)
  })
})
