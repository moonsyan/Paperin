import { describe, expect, it } from 'vitest'
import {
  parseSettingsLockPid,
  SETTINGS_LOCK_STALE_MS,
  shouldStealSettingsLock,
} from './settings-lock-policy'

describe('settings 写锁抢夺策略', () => {
  it('未过陈旧阈值不抢锁', () => {
    expect(shouldStealSettingsLock(3_999, SETTINGS_LOCK_STALE_MS, 1234, () => false)).toBe(false)
  })

  it('持有进程仍活着时即使陈旧也不抢', () => {
    expect(shouldStealSettingsLock(8_000, SETTINGS_LOCK_STALE_MS, 1234, () => true)).toBe(false)
  })

  it('陈旧且持有进程已死，或锁内容无法解析时才抢', () => {
    expect(shouldStealSettingsLock(8_000, SETTINGS_LOCK_STALE_MS, 1234, () => false)).toBe(true)
    expect(shouldStealSettingsLock(8_000, SETTINGS_LOCK_STALE_MS, null, () => true)).toBe(true)
  })

  it('从锁 token 解析 pid，损坏内容视为无法识别持有者', () => {
    expect(parseSettingsLockPid(`${4321}-${Date.now()}-0.12`)).toBe(4321)
    expect(parseSettingsLockPid('not-a-lock')).toBe(null)
    expect(parseSettingsLockPid('')).toBe(null)
  })
})
