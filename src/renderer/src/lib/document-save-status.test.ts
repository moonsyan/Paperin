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

  it('保存中和失败分支优先于已保存文案', () => {
    expect(documentSaveStatusLabel('disk', false, 'saving')).toBe('正在保存…')
    expect(documentSaveStatusLabel('disk', true, 'conflict')).toBe('文件已被其他程序修改')
    expect(documentSaveStatusLabel('disk', true, 'encoding')).toBe('当前编码无法保存这些字符')
    expect(documentSaveStatusLabel('unnamed', true, 'failed')).toBe('保存失败，编辑内容仍保留')
  })

  it('区分磁盘已保存与草稿备份完成', () => {
    expect(documentSaveStatusLabel('disk', false, 'idle', 'backed-up')).toBe('已保存')
    expect(documentSaveStatusLabel('disk', true, 'idle', 'backed-up')).toBe('未保存 · 草稿已备份')
    expect(documentSaveStatusLabel('disk', true, 'idle', 'failed')).toBe('未保存 · 草稿备份失败')
  })
})
