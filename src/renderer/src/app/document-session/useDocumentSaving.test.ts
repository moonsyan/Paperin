// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { MutableRefObject } from 'react'
import { useDocumentSaving, type UseDocumentSavingOptions } from './useDocumentSaving'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const stubDesktopAPI = () => {
  vi.stubGlobal('window', Object.assign(window, {
    desktopAPI: { document: { saveAs: vi.fn() }, window: { setUnsaved: vi.fn() } },
  }))
}

const BIG = 'x'.repeat(1_000_001) // 超过 LARGE_DOCUMENT_SNAPSHOT_CHARS

type Settable<T> = { current: T }

interface HarnessOverrides {
  hasPendingChanges?: () => boolean
  onEnsureWait?: () => void
}

const createHarness = (overrides: HarnessOverrides = {}) => {
  const contentsRef: Settable<Record<string, string>> = { current: { 'file-1': BIG } }
  const contents: Record<string, string> = { 'file-1': BIG }
  const initialOrSavedRef: Settable<Record<string, string>> = { current: { 'file-1': 'baseline' } }
  const openFilesRef: Settable<Array<{ id: string; name: string; path?: string }>> = {
    current: [{ id: 'file-1', name: 'big.md', path: 'D:/notes/big.md' }],
  }
  const activeFileIdRef: Settable<string> = { current: 'file-1' }
  const draftPendingRef: MutableRefObject<null> = { current: null }
  const editorRef = {
    current: {
      isReady: () => true,
      getMarkdown: () => null,
      hasPendingChanges: () =>
        overrides.hasPendingChanges ? overrides.hasPendingChanges() : false,
    },
  }
  const savedWith: Array<[string, string]> = []
  const saveWithEncodingFallback = vi.fn().mockImplementation(async (path: string, content: string) => {
    savedWith.push([path, content])
    return { ok: true, data: { modifiedTime: 1234 } }
  })
  const setToast = vi.fn()
  const setSavedMap = vi.fn((update: (prev: Record<string, boolean>) => Record<string, boolean>) => {
    update({ 'file-1': true })
  })
  const setContents = vi.fn((update: (prev: Record<string, string>) => Record<string, string>) => {
    update(contents)
  })
  const setFileMtime = vi.fn()

  const options: UseDocumentSavingOptions = {
    state: {
      activeFileId: 'file-1',
      activeFileIdRef,
      contents,
      contentsRef,
      fileMtime: {},
      initialOrSavedRef,
      openFiles: openFilesRef.current,
      openFilesRef,
      savedMap: { 'file-1': false },
      setActiveFileId: vi.fn(),
      setContents,
      setDocTitle: vi.fn(),
      setEncodingMap: vi.fn(),
      setFileMtime,
      setOpenFiles: vi.fn(),
      setSavedMap,
    } as unknown as UseDocumentSavingOptions['state'],
    editorRef: editorRef as unknown as UseDocumentSavingOptions['editorRef'],
    saveQueueApi: {
      saveWithEncodingFallback,
      recordHistory: vi.fn(),
      resolveSelfConflict: vi.fn().mockResolvedValue(null),
      saveQueueRef: { current: null },
    } as unknown as UseDocumentSavingOptions['saveQueueApi'],
    dirOfFile: () => 'D:/notes',
    liveContentOf: (id: string) => contentsRef.current[id] ?? '',
    replaceEditorContent: vi.fn(),
    recordRecent: vi.fn(),
    setToast,
    clearDraft: vi.fn().mockResolvedValue(undefined),
    saveDraft: vi.fn().mockResolvedValue(undefined),
    draftPendingRef,
    snapshotSettleTimeoutMs: 80,
  }

  return { options, savedWith, setToast, contentsRef, setContents, setSavedMap }
}

describe('useDocumentSaving 大文档快照契约（T05）', () => {
  it('快照无未落账输入时直接用缓存保存（零等待路径不变）', async () => {
    stubDesktopAPI()
    const { options, savedWith } = createHarness()
    const { result } = renderHook(() => useDocumentSaving(options))
    await result.current.handleSave()
    await waitFor(() => expect(savedWith).toHaveLength(1))
    expect(savedWith[0][1]).toBe(BIG)
  })

  it('防抖窗口内有输入时等待落账，写入的是含末次输入的新快照', async () => {
    let pending = true
    stubDesktopAPI()
    const { options, savedWith } = createHarness({
      hasPendingChanges: () => pending,
    })
    // 模拟 markdownUpdated 防抖落账：20ms 后缓存更新且 pending 复位
    setTimeout(() => {
      pending = false
      options.state.contentsRef.current = { 'file-1': BIG + '<last-keystroke>' }
    }, 20)
    const { result } = renderHook(() => useDocumentSaving(options))
    await result.current.handleSave()
    await waitFor(() => expect(savedWith).toHaveLength(1))
    expect(savedWith[0][1]).toBe(BIG + '<last-keystroke>')
  })

  it('落账等待超时走失败出口：仍保存已落账版本并提示用户', async () => {
    stubDesktopAPI()
    const { options, savedWith, setToast } = createHarness({
      hasPendingChanges: () => true,
    })
    const { result } = renderHook(() => useDocumentSaving(options))
    await result.current.handleSave()
    await waitFor(() => expect(savedWith).toHaveLength(1))
    // 保存的是当前已落账缓存，不因等待失败而中止保存
    expect(savedWith[0][1]).toBe(BIG)
    expect(setToast).toHaveBeenCalledWith(expect.stringContaining('仍在生成快照'))
  })

  it('小文档仍走编辑器同步读取（低延迟语义保留）', async () => {
    stubDesktopAPI()
    const { options, savedWith } = createHarness()
    options.state.contents = { 'file-1': 'small' }
    options.state.contentsRef.current = { 'file-1': 'small' }
    options.state.openFiles = [{ id: 'file-1', name: 'small.md', path: 'D:/notes/small.md' }]
    options.state.openFilesRef.current = [{ id: 'file-1', name: 'small.md', path: 'D:/notes/small.md' }]
    const getMarkdown = vi.fn(() => 'small from editor')
    ;(options.editorRef as unknown as { current: Record<string, unknown> }).current.getMarkdown = getMarkdown
    const { result } = renderHook(() => useDocumentSaving(options))
    await result.current.handleSave()
    await waitFor(() => expect(savedWith).toHaveLength(1))
    expect(getMarkdown).toHaveBeenCalled()
    expect(savedWith[0][1]).toContain('small from editor')
  })
})
