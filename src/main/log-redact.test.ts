import { describe, expect, it } from 'vitest'
import { formatErrorForLog, redactPathsInText } from './log-redact'

describe('log-redact', () => {
  it('脱敏 Windows 绝对路径', () => {
    expect(redactPathsInText('failed E:\\yws\\notes\\a.md ok')).toBe('failed <path> ok')
    expect(redactPathsInText('open C:\\Users\\Admin\\file.md')).toBe('open <path>')
  })

  it('脱敏 POSIX 用户路径', () => {
    expect(redactPathsInText('read /Users/me/docs/a.md')).toBe('read <path>')
  })

  it('formatErrorForLog 处理 Error.stack', () => {
    const error = new Error('boom at D:\\proj\\src\\main.ts:1')
    error.stack = 'Error: boom at D:\\proj\\src\\main.ts:1\n    at run (D:\\proj\\src\\main.ts:2)'
    const formatted = formatErrorForLog(error)
    expect(formatted).not.toContain('D:\\proj')
    expect(formatted).toContain('<path>')
  })
})
