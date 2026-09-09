import { describe, expect, it } from 'vitest'
import {
  closeDocumentInSession,
  emptyDocumentSessionState,
  migrateDocumentPathInSession,
  markDocumentSavedInSession,
  openDocumentInSession,
  updateDocumentContentInSession,
} from './document-session-state'
import { createDocumentRecord } from './document-record'

const doc = (id: string, content = '正文') =>
  createDocumentRecord({ id, name: `${id}.md`, content })

describe('openDocumentInSession', () => {
  it('新文档进入字典并成为活动文档', () => {
    const next = openDocumentInSession(emptyDocumentSessionState(), doc('a'))
    expect(next.documents['a'].id).toBe('a')
    expect(next.activeFileId).toBe('a')
  })

  it('重复打开已存在文档只激活，不覆盖会话中的编辑状态', () => {
    const opened = openDocumentInSession(emptyDocumentSessionState(), doc('a', '旧'))
    const edited = updateDocumentContentInSession(opened, 'a', '编辑中')
    // 磁盘重开同一路径返回的记录不得抹掉未保存内容与脏标记
    const again = openDocumentInSession(edited, createDocumentRecord({ id: 'a', name: 'a.md', content: '旧' }))
    expect(again.documents['a'].content).toBe('编辑中')
    expect(again.documents['a'].dirty).toBe(true)
    expect(again.activeFileId).toBe('a')
  })
})

describe('update / save 迁移到会话字典', () => {
  it('更新内容只影响目标文档，其他记录保持引用不变', () => {
    let state = openDocumentInSession(emptyDocumentSessionState(), doc('a'))
    state = openDocumentInSession(state, doc('b'))
    const before = state.documents['b']
    const next = updateDocumentContentInSession(state, 'a', '新内容')
    expect(next.documents['a'].content).toBe('新内容')
    expect(next.documents['a'].dirty).toBe(true)
    expect(next.documents['b']).toBe(before)
  })

  it('保存后清除目标文档 dirty 并更新基线', () => {
    let state = openDocumentInSession(emptyDocumentSessionState(), doc('a'))
    state = updateDocumentContentInSession(state, 'a', '草稿v2')
    const saved = markDocumentSavedInSession(state, 'a', '草稿v2', 42)
    expect(saved.documents['a'].dirty).toBe(false)
    expect(saved.documents['a'].savedContent).toBe('草稿v2')
    expect(saved.documents['a'].modifiedTime).toBe(42)
  })

  it('对不存在文档的操作安全返回原状态', () => {
    const base = openDocumentInSession(emptyDocumentSessionState(), doc('a'))
    expect(updateDocumentContentInSession(base, 'ghost', 'x')).toBe(base)
    expect(markDocumentSavedInSession(base, 'ghost', 'x', 1)).toBe(base)
  })
})

describe('migrateDocumentPathInSession', () => {
  it('批量字典中的单个迁移：仅目标文档 path/name 变化，id 不变', () => {
    let state = openDocumentInSession(emptyDocumentSessionState(), doc('a'))
    state = openDocumentInSession(state, doc('b'))
    const next = migrateDocumentPathInSession(state, 'a', 'D:/notes/renamed.md', 'renamed.md')
    expect(next.documents['a'].path).toBe('D:/notes/renamed.md')
    expect(next.documents['a'].name).toBe('renamed.md')
    expect(next.documents['a'].content).toBe('正文')
    expect(next.activeFileId).toBe(state.activeFileId)
  })
})

describe('closeDocumentInSession', () => {
  it('关闭非活动文档不影响活动标签', () => {
    let state = openDocumentInSession(emptyDocumentSessionState(), doc('a'))
    state = openDocumentInSession(state, doc('b')) // active=b
    const closed = closeDocumentInSession(state, 'a')
    expect(closed.documents['a']).toBeUndefined()
    expect(closed.activeFileId).toBe('b')
  })

  it('关闭活动文档时按打开顺序回退到相邻文档', () => {
    let state = openDocumentInSession(emptyDocumentSessionState(), doc('a'))
    state = openDocumentInSession(state, doc('b'))
    state = openDocumentInSession(state, doc('c'))
    // 关闭中间标签 b → 优先右侧 c
    expect(closeDocumentInSession(state, 'b').activeFileId).toBe('c')
    // 关闭最后一个 c → 回退左侧 b
    expect(closeDocumentInSession(closeDocumentInSession(state, 'c'), 'b').activeFileId).toBe('a')
  })

  it('关闭最后一个文档后活动清空且不可变', () => {
    const state = openDocumentInSession(emptyDocumentSessionState(), doc('a'))
    const beforeKeys = Object.keys(state.documents)
    const closed = closeDocumentInSession(state, 'a')
    expect(Object.keys(closed.documents)).toEqual([])
    expect(closed.activeFileId).toBeNull()
    expect(Object.keys(state.documents)).toEqual(beforeKeys)
  })

  it('对不存在文档的关闭返回原状态', () => {
    const base = openDocumentInSession(emptyDocumentSessionState(), doc('a'))
    expect(closeDocumentInSession(base, 'ghost')).toBe(base)
  })
})
