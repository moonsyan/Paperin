import { describe, expect, it } from 'vitest'
import { shouldDeferLargeDocumentReplace } from './useEditorDocumentSync'

describe('编辑器文档同步', () => {
  it('仅在尚未延迟时推迟大文档替换', () => {
    expect(shouldDeferLargeDocumentReplace('a'.repeat(200_001), false)).toBe(true)
    expect(shouldDeferLargeDocumentReplace('a'.repeat(200_001), true)).toBe(false)
  })

  it('普通文档不延迟替换', () => {
    expect(shouldDeferLargeDocumentReplace('# 笔记', false)).toBe(false)
  })
})
