import { describe, expect, it } from 'vitest'
import {
  LARGE_DOCUMENT_SNAPSHOT_CHARS,
  shouldPreferCachedDocumentSnapshot,
} from './large-document-save'

describe('large document save snapshot policy', () => {
  it('keeps synchronous editor serialization for ordinary documents', () => {
    expect(shouldPreferCachedDocumentSnapshot('x'.repeat(200_000))).toBe(false)
  })

  it('uses the listener snapshot for multi-megabyte documents', () => {
    expect(shouldPreferCachedDocumentSnapshot('x'.repeat(LARGE_DOCUMENT_SNAPSHOT_CHARS + 1))).toBe(true)
  })
})
