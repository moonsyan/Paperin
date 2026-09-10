import { describe, expect, it } from 'vitest'
import { classifyDocumentSource } from './document-source'

describe('document source classification', () => {
  it('treats a disk file as external when no workspace is open', () => {
    expect(classifyDocumentSource('D:/downloads/a.md', null, true)).toBe('external')
  })

  it('keeps untitled documents in the workspace experience', () => {
    expect(classifyDocumentSource(undefined, 'D:/notes', true)).toBe('workspace')
  })

  it('uses a directory boundary and platform casing for workspace membership', () => {
    expect(classifyDocumentSource('d:/NOTES/sub/a.md', 'D:/notes', true)).toBe('workspace')
    expect(classifyDocumentSource('D:/notes-old/a.md', 'D:/notes', true)).toBe('external')
    expect(classifyDocumentSource('/Notes/a.md', '/notes', false)).toBe('external')
  })
})
