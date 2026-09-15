import { describe, expect, it } from 'vitest'
import { documentSaveStatusLabel } from './document-save-status'

describe('documentSaveStatusLabel', () => {
  it('只对已有磁盘路径且没有新修改的文档显示已保存', () => {
    expect(documentSaveStatusLabel('disk', false)).toBe('已保存')
    expect(documentSaveStatusLabel('disk', true)).toBe('未保存')
    expect(documentSaveStatusLabel('demo', false)).toBe('示例文档')
    expect(documentSaveStatusLabel('demo', true)).toContain('未保存修改')
    expect(documentSaveStatusLabel('unnamed', false)).toBe('尚未保存到磁盘')
    expect(documentSaveStatusLabel('unnamed', true)).toContain('有修改')
  })
})
