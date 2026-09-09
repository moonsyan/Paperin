import { describe, expect, it } from 'vitest'
import {
  createDocumentRef,
  createDocumentSession,
  isExternalDocument,
  markDocumentSessionSaved,
  migrateDocumentRef,
  updateDocumentSession,
} from './document-session'

describe('document session domain model', () => {
  const ref = createDocumentRef({
    id: 'doc-1',
    path: 'notes/中文.md',
    source: 'workspace',
    workspaceId: 'vault-1',
  })

  it('derives a title from a Chinese path and starts clean', () => {
    const session = createDocumentSession(ref, '# 标题')
    expect(session.ref.title).toBe('中文.md')
    expect(session.dirty).toBe(false)
    expect(isExternalDocument(session.ref)).toBe(false)
  })

  it('marks edits dirty against the saved baseline', () => {
    const session = createDocumentSession(ref, '原文')
    expect(updateDocumentSession(session, '修改').dirty).toBe(true)
    expect(updateDocumentSession(session, '原文').dirty).toBe(false)
  })

  it('records mtime and encoding only after a successful save', () => {
    const session = createDocumentSession(ref, '原文')
    const saved = markDocumentSessionSaved(
      updateDocumentSession(session, '修改'),
      '修改',
      42,
      'gbk',
    )
    expect(saved).toMatchObject({ dirty: false, savedContent: '修改', expectedMtime: 42, encoding: 'gbk' })
  })

  it('migrates path without losing dirty content or source', () => {
    const session = updateDocumentSession(createDocumentSession(ref, '原文'), '未保存')
    const migrated = migrateDocumentRef(session, 'archive/中文.md')
    expect(migrated.ref.path).toBe('archive/中文.md')
    expect(migrated.ref.title).toBe('中文.md')
    expect(migrated.content).toBe('未保存')
    expect(migrated.dirty).toBe(true)
  })

  it('keeps loose files outside the workspace tree', () => {
    const external = createDocumentRef({ id: 'external-1', path: 'D:/tmp/readme.md', source: 'external' })
    expect(isExternalDocument(external)).toBe(true)
    expect(external.workspaceId).toBeUndefined()
  })
})
