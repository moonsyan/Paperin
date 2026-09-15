import { describe, expect, it } from 'vitest'
import {
  shouldDeferLargeDocumentReplace,
  shouldHoldPendingLargeDocumentFlush,
} from './useEditorDocumentSync'

describe('编辑器文档同步', () => {
  it('仅在尚未延迟时推迟大文档替换', () => {
    expect(shouldDeferLargeDocumentReplace('a'.repeat(200_001), false)).toBe(true)
    expect(shouldDeferLargeDocumentReplace('a'.repeat(200_001), true)).toBe(false)
  })

  it('普通文档不延迟替换', () => {
    expect(shouldDeferLargeDocumentReplace('# 笔记', false)).toBe(false)
  })

  it('大文档有未落账编辑时不允许 flush 清除脏标记', () => {
    expect(shouldHoldPendingLargeDocumentFlush('x'.repeat(1_000_001), true)).toBe(true)
    expect(shouldHoldPendingLargeDocumentFlush('x'.repeat(1_000_001), false)).toBe(false)
    expect(shouldHoldPendingLargeDocumentFlush('# 普通文档', true)).toBe(false)
  })
})
