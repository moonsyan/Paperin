// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { OpenFile } from '../../components/Sidebar'
import { buildDocumentRecords, getActiveDocumentState, useDocumentState } from './useDocumentState'

describe('文档会话状态', () => {
  it('没有打开标签时返回空正文和已保存状态', () => {
    expect(
      getActiveDocumentState([], { welcome: '# 欢迎' }, { welcome: false }, 'welcome'),
    ).toEqual({ activeFile: undefined, activeContent: '', saved: true })
  })

  it('返回活动标签对应的正文与保存标记', () => {
    const openFiles = [{ id: 'note', name: '笔记.md' }]

    expect(
      getActiveDocumentState(openFiles, { note: '# 笔记' }, { note: false }, 'note'),
    ).toEqual({
      activeFile: openFiles[0],
      activeContent: '# 笔记',
      saved: false,
    })
  })
})

const FILE_A: OpenFile = { id: 'a', name: 'a.md', path: '/w/a.md', preview: true }
const FILE_B: OpenFile = { id: 'b', name: 'b.md', pinned: true }

describe('buildDocumentRecords（DocumentRecord 镜像视图）', () => {
  it('从五字典派生完整 DocumentRecord，脏口径与 savedMap 一致', () => {
    const records = buildDocumentRecords(
      [FILE_A, FILE_B],
      { a: 'A 当前内容', b: 'B 内容' },
      { a: false, b: true },
      { a: 111 },
      { a: 'GBK' },
      { a: 'A 磁盘基线', b: 'B 基线' },
    )
    expect(records.a).toEqual({
      id: 'a',
      path: '/w/a.md',
      name: 'a.md',
      content: 'A 当前内容',
      savedContent: 'A 磁盘基线',
      modifiedTime: 111,
      encoding: 'GBK',
      dirty: true,
      pinned: false,
      preview: true,
      draftState: 'none',
    })
    // b 无 mtime/编码 → 缺省；固定标签进 pinned
    expect(records.b.modifiedTime).toBeUndefined()
    expect(records.b.encoding).toBe('UTF-8')
    expect(records.b.pinned).toBe(true)
    expect(records.b.preview).toBe(false)
    expect(records.b.dirty).toBe(false)
  })

  it('contents 缺失的标签回退空内容，不产生未定义记录', () => {
    const records = buildDocumentRecords([FILE_A], {}, {}, {}, {})
    expect(records.a.content).toBe('')
    expect(records.a.savedContent).toBe('')
    expect(records.a.dirty).toBe(false)
  })

  it('只包含打开中的文档：字典残留的孤儿键不进入视图', () => {
    const records = buildDocumentRecords(
      [FILE_A],
      { a: 'x', ghost: '幽灵' },
      { a: true },
      {},
      {},
      {},
    )
    expect(Object.keys(records)).toEqual(['a'])
  })
})

describe('useDocumentState.documents', () => {
  it('documents 是与 openFiles 同步的活动文档记录视图', () => {
    const { result } = renderHook(() => useDocumentState())

    act(() => {
      result.current.setOpenFiles([{ id: 'doc-1', name: '文档一.md', path: '/w/文档一.md' }])
      result.current.setContents((prev) => ({ ...prev, 'doc-1': '新内容' }))
      result.current.setSavedMap((prev) => ({ ...prev, 'doc-1': false }))
      result.current.setFileMtime({ 'doc-1': 42 })
    })

    const record = result.current.documents['doc-1']
    expect(record).toBeDefined()
    expect(record.name).toBe('文档一.md')
    expect(record.path).toBe('/w/文档一.md')
    expect(record.content).toBe('新内容')
    expect(record.dirty).toBe(true)
    expect(result.current.activeDocument?.id).toBeUndefined() // activeFileId 未切换

    act(() => {
      result.current.setActiveFileId('doc-1')
    })
    expect(result.current.activeDocument?.id).toBe('doc-1')
    expect(result.current.activeSessionRef.current).toBe(1)
  })
})
