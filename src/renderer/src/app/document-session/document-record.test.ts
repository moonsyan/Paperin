import { describe, expect, it } from 'vitest'
import {
  createDocumentRecord,
  markDocumentSaved,
  migrateDocumentPath,
  updateDocumentContent,
} from './document-record'

describe('createDocumentRecord', () => {
  it('默认值：savedContent 与 content 一致，dirty/pinned/preview 关闭，draftState 为 none', () => {
    const record = createDocumentRecord({ id: 'file-a', name: 'a.md', content: '正文' })
    expect(record).toEqual({
      id: 'file-a',
      name: 'a.md',
      content: '正文',
      savedContent: '正文',
      modifiedTime: undefined,
      encoding: undefined,
      dirty: false,
      pinned: false,
      preview: false,
      draftState: 'none',
    })
    expect(record.path).toBeUndefined()
  })

  it('显式传入的 path、mtime、编码和视图标记被保留', () => {
    const record = createDocumentRecord({
      id: 'file-b',
      name: 'b.md',
      content: 'x',
      path: 'D:/notes/b.md',
      modifiedTime: 100,
      encoding: 'GBK',
      pinned: true,
      preview: true,
      draftState: 'pending',
    })
    expect(record.path).toBe('D:/notes/b.md')
    expect(record.modifiedTime).toBe(100)
    expect(record.encoding).toBe('GBK')
    expect(record.pinned).toBe(true)
    expect(record.preview).toBe(true)
    expect(record.draftState).toBe('pending')
  })
})

describe('updateDocumentContent', () => {
  it('内容变更只设置 dirty，不改变保存基线', () => {
    const initial = createDocumentRecord({ id: 'file-a', name: 'a.md', content: '旧', path: 'a.md' })
    const next = updateDocumentContent(initial, '新')
    expect(next.content).toBe('新')
    expect(next.savedContent).toBe('旧')
    expect(next.dirty).toBe(true)
  })

  it('相同内容重复同步不误报 dirty，且返回同一内容语义的记录', () => {
    const initial = createDocumentRecord({ id: 'file-a', name: 'a.md', content: '旧' })
    const changed = updateDocumentContent(initial, '新')
    const same = updateDocumentContent(changed, '新')
    expect(same.content).toBe('新')
    expect(same.dirty).toBe(true)
    // 从干净状态写入相同内容也不置脏
    const cleanSame = updateDocumentContent(initial, '旧')
    expect(cleanSame.dirty).toBe(false)
  })

  it('不可变：不修改原记录', () => {
    const initial = createDocumentRecord({ id: 'file-a', name: 'a.md', content: '旧' })
    updateDocumentContent(initial, '新')
    expect(initial.content).toBe('旧')
    expect(initial.dirty).toBe(false)
  })
})

describe('markDocumentSaved', () => {
  it('保存后更新基线、mtime 并清除 dirty', () => {
    const initial = createDocumentRecord({ id: 'file-a', name: 'a.md', content: '旧' })
    const changed = updateDocumentContent(initial, '新')
    const saved = markDocumentSaved(changed, '新', 42)
    expect(saved.savedContent).toBe('新')
    expect(saved.modifiedTime).toBe(42)
    expect(saved.dirty).toBe(false)
  })

  it('保存基线取磁盘事实：与编辑快照不同时以保存参数为准并保持一致脏判定', () => {
    // 程序性整理（规范化换行等）可能使落盘内容与编辑器快照略有差异，
    // dirty 判定必须基于保存后的基线而不是旧的 savedContent
    const initial = createDocumentRecord({ id: 'file-a', name: 'a.md', content: 'CRLF' })
    const saved = markDocumentSaved(initial, 'crlf-normalized', 7)
    expect(saved.dirty).toBe(false)
    const edited = updateDocumentContent(saved, 'crlf-normalized')
    expect(edited.dirty).toBe(false)
  })
})

describe('migrateDocumentPath', () => {
  it('重命名/移动只修改 path 和 name，不动内容和脏状态', () => {
    const initial = createDocumentRecord({
      id: 'file-a',
      name: 'a.md',
      content: '草稿',
      path: 'D:/notes/a.md',
    })
    const moved = updateDocumentContent(initial, '草稿v2')
    const renamed = migrateDocumentPath(moved, 'D:/notes/b.md', 'b.md')
    expect(renamed.path).toBe('D:/notes/b.md')
    expect(renamed.name).toBe('b.md')
    expect(renamed.id).toBe('file-a')
    expect(renamed.content).toBe('草稿v2')
    expect(renamed.savedContent).toBe('草稿')
    expect(renamed.dirty).toBe(true)
    // 原 record 不被修改
    expect(initial.path).toBe('D:/notes/a.md')
    expect(initial.name).toBe('a.md')
  })

  it('从无路径文档补全路径（另存为）同样保留内容与视图标记', () => {
    const untitled = createDocumentRecord({
      id: 'untitled-1',
      name: '未命名',
      content: 'x',
      preview: true,
    })
    const savedAs = migrateDocumentPath(untitled, 'D:/notes/x.md', 'x.md')
    expect(savedAs.path).toBe('D:/notes/x.md')
    expect(savedAs.preview).toBe(true)
    expect(savedAs.content).toBe('x')
  })
})
