import { describe, expect, it } from 'vitest'
import {
  isRestrictedSettingsKey,
  isRestrictedSettingsReadKey,
  isRestrictedSettingsWriteKey,
} from './settings-policy'

describe('设置访问策略', () => {
  it('禁止通用设置接口读取或写入图床密钥配置', () => {
    expect(isRestrictedSettingsKey('imageHost')).toBe(true)
    expect(isRestrictedSettingsKey('theme')).toBe(false)
  })

  it('imageHost 读写均受限；customCss/exportCss 仅限写入（读取供恢复）', () => {
    expect(isRestrictedSettingsReadKey('imageHost')).toBe(true)
    expect(isRestrictedSettingsReadKey('customCss')).toBe(false)
    expect(isRestrictedSettingsReadKey('exportCss')).toBe(false)
    expect(isRestrictedSettingsWriteKey('imageHost')).toBe(true)
    expect(isRestrictedSettingsWriteKey('customCss')).toBe(true)
    expect(isRestrictedSettingsWriteKey('exportCss')).toBe(true)
    expect(isRestrictedSettingsWriteKey('theme')).toBe(false)
  })

  it('autoUpdateEnabled 可通过通用设置读写', () => {
    expect(isRestrictedSettingsKey('autoUpdateEnabled')).toBe(false)
    expect(isRestrictedSettingsReadKey('autoUpdateEnabled')).toBe(false)
    expect(isRestrictedSettingsWriteKey('autoUpdateEnabled')).toBe(false)
  })
})
