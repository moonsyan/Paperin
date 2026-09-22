import { describe, expect, it, beforeEach } from 'vitest'
import {
  getRecentSupportErrorCodes,
  noteSupportErrorCode,
  resetRecentSupportErrorCodesForTests,
} from './recent-error-codes'
import { serializeSupportSummary, buildSupportSummary } from '../../shared/support-summary'
import { scanSupportSummaryForForbiddenContent } from '../../shared/support-summary'

describe('recentSupportErrorCodes 环形缓冲', () => {
  beforeEach(() => {
    resetRecentSupportErrorCodesForTests()
  })

  it('最近使用的错误码移到队首且不重复', () => {
    noteSupportErrorCode('IO_ERROR')
    noteSupportErrorCode('CONFLICT')
    noteSupportErrorCode('IO_ERROR')
    expect(getRecentSupportErrorCodes()).toEqual(['IO_ERROR', 'CONFLICT'])
  })

  it('超过上限时丢弃最旧项', () => {
    for (let i = 0; i < 25; i += 1) {
      noteSupportErrorCode(`CODE_${i}`)
    }
    const codes = getRecentSupportErrorCodes()
    expect(codes).toHaveLength(20)
    expect(codes[0]).toBe('CODE_24')
    expect(codes[codes.length - 1]).toBe('CODE_5')
  })

  it('拒绝非枚举形字符串与路径片段', () => {
    noteSupportErrorCode('C:\\secret')
    noteSupportErrorCode('IO ERROR')
    noteSupportErrorCode('')
    expect(getRecentSupportErrorCodes()).toEqual([])
  })

  it('序列化摘要不含路径形内容', () => {
    noteSupportErrorCode('ENCODING_LOSS')
    const json = serializeSupportSummary(
      buildSupportSummary(
        {
          appVersion: '0.7.0',
          platform: 'win32',
          arch: 'x64',
          electronVersion: '33.0.0',
          autoUpdateEnabled: true,
          eventCounts: { save_failed: 1 },
          recentErrorCodes: [...getRecentSupportErrorCodes()],
        },
        { documentCount: 0, indexComplete: false, diagnosticsByCode: {} },
      ),
    )
    expect(scanSupportSummaryForForbiddenContent(json)).toBe(false)
    expect(json).not.toMatch(/[/\\]|C:\\\\/)
  })
})
