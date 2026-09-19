// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { MutableRefObject } from 'react'
import { useDocumentSaving, type UseDocumentSavingOptions } from './useDocumentSaving'
import { DocumentSaveQueue } from '../../lib/document-save-queue'
import type { AutoSaveSnapshot } from './types'
import { useDocumentCloseSaving } from './useDocumentCloseSaving'
import { requestConfirm } from '../../lib/confirm-dialog'
import type { SaveResult } from '../../../../preload/api'

vi.mock('../../lib/confirm-dialog', () => ({ requestConfirm: vi.fn().mockResolvedValue('save') }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(requestConfirm).mockResolvedValue('save')
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
  const activeSessionRef: Settable<number> = { current: 0 }
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
      activeSessionRef,
      contents,
      contentsRef,
      fileMtime: {},
      fileMtimeRef: { current: {} },
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
      cancelAutoSave: vi.fn(),
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

  return { options, savedWith, setToast, contentsRef, setContents, setSavedMap, setFileMtime }
}

describe('useDocumentSaving 大文档快照契约（T05）', () => {
  it('未命名大文档缓存等于基线但仍有输入时，不可绕过快照等待关闭', async () => {
    stubDesktopAPI()
    const { options } = createHarness({ hasPendingChanges: () => true })
    options.state.openFilesRef.current = [{ id: 'file-1', name: '未命名.md' }]
    options.state.initialOrSavedRef.current['file-1'] = BIG
    const { result } = renderHook(() => useDocumentSaving(options))
    await expect(result.current.saveBeforeClose('file-1')).resolves.toBe(false)
    expect(window.desktopAPI.document.saveAs).not.toHaveBeenCalled()
  })

  it.each([32, 1_000_000, 1_000_001, 5 * 1024 * 1024])('关闭等待期间新输入未落账时保持打开（%i 字符，30 次）', async (size) => {
    stubDesktopAPI()
    const content = 'x'.repeat(size)
    for (let iteration = 0; iteration < 30; iteration++) {
      let pending = false
      const { options } = createHarness({ hasPendingChanges: () => pending })
      options.state.contentsRef.current['file-1'] = content
      const queue = new DocumentSaveQueue<AutoSaveSnapshot>(async () => {}, 1_000)
      vi.spyOn(queue, 'flush').mockImplementation(async () => {
        options.state.initialOrSavedRef.current['file-1'] = content
        pending = true
      })
      options.saveQueueApi.saveQueueRef.current = queue
      const { result, unmount } = renderHook(() => useDocumentSaving(options))
      await expect(result.current.saveBeforeClose('file-1')).resolves.toBe(false)
      pending = false
      vi.mocked(queue.flush).mockResolvedValue(undefined)
      await expect(result.current.saveBeforeClose('file-1')).resolves.toBe(true)
      unmount()
    }
  })

  it('另存为期间继续输入不能关闭未命名文档', async () => {
    stubDesktopAPI()
    const { options } = createHarness()
    options.state.openFilesRef.current = [{ id: 'file-1', name: '未命名.md' }]
    vi.mocked(window.desktopAPI.document.saveAs).mockImplementation(async () => {
      options.state.contentsRef.current['file-1'] = BIG + '最后输入'
      return { ok: true, data: { path: 'D:/notes/saved.md', name: 'saved.md', modifiedTime: 42 } }
    })
    const { result } = renderHook(() => useDocumentSaving(options))
    await expect(result.current.saveBeforeClose('file-1')).resolves.toBe(false)
    expect(options.state.contentsRef.current['file-1']).toContain('最后输入')
  })

  it('关闭等待期间 A→B→A 的旧请求不能关闭新会话', async () => {
    stubDesktopAPI()
    const { options } = createHarness()
    const queue = new DocumentSaveQueue<AutoSaveSnapshot>(async () => {}, 1_000)
    vi.spyOn(queue, 'flush').mockImplementation(async () => {
      options.state.initialOrSavedRef.current['file-1'] = BIG
      options.state.activeSessionRef.current += 2
    })
    options.saveQueueApi.saveQueueRef.current = queue
    const { result } = renderHook(() => useDocumentSaving(options))
    await expect(result.current.saveBeforeClose('file-1')).resolves.toBe(false)
  })

  it('关闭保存等待中卸载后不放行，也不产生提示或最近文件更新', async () => {
    stubDesktopAPI()
    const { options, setToast } = createHarness()
    options.state.openFilesRef.current = [{ id: 'file-1', name: '未命名.md' }]
    let completeSave: (() => void) | undefined
    vi.mocked(window.desktopAPI.document.saveAs).mockImplementation(() => new Promise((resolve) => {
      completeSave = () => resolve({ ok: true, data: { path: 'D:/notes/saved.md', name: 'saved.md', modifiedTime: 42 } })
    }))
    const { result, unmount } = renderHook(() => useDocumentCloseSaving(options))
    const closing = result.current('file-1')
    await waitFor(() => expect(completeSave).toBeDefined())
    unmount()
    completeSave!()
    await expect(closing).resolves.toBe(false)
    expect(options.recordRecent).not.toHaveBeenCalled()
    expect(setToast).not.toHaveBeenCalled()
  })

  it.each(['cancel', 'discard', 'save'])('未命名关闭保留 %s 的明确决策', async (choice) => {
    stubDesktopAPI()
    const { options } = createHarness()
    options.state.openFilesRef.current = [{ id: 'file-1', name: '未命名.md' }]
    vi.mocked(requestConfirm).mockResolvedValue(choice)
    vi.mocked(window.desktopAPI.document.saveAs).mockResolvedValue({ ok: true, data: { path: 'D:/notes/saved.md', name: 'saved.md', modifiedTime: 42 } })
    const { result } = renderHook(() => useDocumentCloseSaving(options))
    await expect(result.current('file-1')).resolves.toBe(choice !== 'cancel')
    expect(window.desktopAPI.document.saveAs).toHaveBeenCalledTimes(choice === 'save' ? 1 : 0)
  })

  it('另存为调用拒绝时保持文档打开并提示重试', async () => {
    stubDesktopAPI()
    const { options, setToast } = createHarness()
    options.state.openFilesRef.current = [{ id: 'file-1', name: '未命名.md' }]
    vi.mocked(window.desktopAPI.document.saveAs).mockRejectedValue(new Error('IPC disconnected'))
    const { result } = renderHook(() => useDocumentCloseSaving(options))
    await expect(result.current('file-1')).resolves.toBe(false)
    expect(setToast).toHaveBeenCalledWith(expect.stringContaining('保存失败'))
  })

  it('手动另存为等待期间切换会话时，不把旧结果套用到当前文档', async () => {
    stubDesktopAPI()
    const { options, setToast } = createHarness()
    let resolveSaveAs: ((result: { ok: true; data: { path: string; name: string; modifiedTime: number } }) => void) | undefined
    vi.mocked(window.desktopAPI.document.saveAs).mockImplementation(() => new Promise((resolve) => {
      resolveSaveAs = resolve
    }))
    const { result } = renderHook(() => useDocumentSaving(options))
    const saving = result.current.handleSaveAs()
    await waitFor(() => expect(resolveSaveAs).toBeDefined())
    options.state.activeFileIdRef.current = 'file-2'
    options.state.activeSessionRef.current++
    resolveSaveAs!({ ok: true, data: { path: 'D:/notes/saved.md', name: 'saved.md', modifiedTime: 42 } })

    await saving

    expect(options.state.setActiveFileId).not.toHaveBeenCalled()
    expect(options.state.setOpenFiles).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith(expect.stringContaining('文档已切换'))
  })

  it('另存为等待期间已有新快照时保留新内容并维持 dirty', async () => {
    stubDesktopAPI()
    const { options, setContents, setSavedMap } = createHarness()
    let resolveSaveAs: ((result: { ok: true; data: { path: string; name: string; modifiedTime: number } }) => void) | undefined
    vi.mocked(window.desktopAPI.document.saveAs).mockImplementation(() => new Promise((resolve) => {
      resolveSaveAs = resolve
    }))
    const { result } = renderHook(() => useDocumentSaving(options))
    const saving = result.current.handleSaveAs()
    await waitFor(() => expect(resolveSaveAs).toBeDefined())
    const newerContent = BIG + '<during-save-as>'
    options.state.contentsRef.current = { 'file-1': newerContent }
    resolveSaveAs!({ ok: true, data: { path: 'D:/notes/saved.md', name: 'saved.md', modifiedTime: 42 } })

    await saving

    const newId = 'file-D:/notes/saved.md'
    const contentCalls = vi.mocked(setContents).mock.calls
    const savedCalls = vi.mocked(setSavedMap).mock.calls
    const updateContents = contentCalls[contentCalls.length - 1]?.[0]
    const updateSavedMap = savedCalls[savedCalls.length - 1]?.[0]
    expect(typeof updateContents === 'function' && updateContents({ 'file-1': BIG })[newId]).toBe(newerContent)
    expect(typeof updateSavedMap === 'function' && updateSavedMap({ 'file-1': false })[newId]).toBe(false)
  })

  it('手动另存为等待期间卸载时，不写入已卸载的会话', async () => {
    stubDesktopAPI()
    const { options, setToast } = createHarness()
    let resolveSaveAs: ((result: { ok: true; data: { path: string; name: string; modifiedTime: number } }) => void) | undefined
    vi.mocked(window.desktopAPI.document.saveAs).mockImplementation(() => new Promise((resolve) => {
      resolveSaveAs = resolve
    }))
    const { result, unmount } = renderHook(() => useDocumentSaving(options))
    const saving = result.current.handleSaveAs()
    await waitFor(() => expect(resolveSaveAs).toBeDefined())
    unmount()
    resolveSaveAs!({ ok: true, data: { path: 'D:/notes/saved.md', name: 'saved.md', modifiedTime: 42 } })

    await saving

    expect(options.state.setActiveFileId).not.toHaveBeenCalled()
    expect(options.state.setOpenFiles).not.toHaveBeenCalled()
    expect(setToast).not.toHaveBeenCalled()
  })

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

  it('大文档另存为在防抖窗口内等待末次输入落账', async () => {
    let pending = true
    stubDesktopAPI()
    const { options } = createHarness({ hasPendingChanges: () => pending })
    vi.mocked(window.desktopAPI.document.saveAs).mockResolvedValue({
      ok: true,
      data: { path: 'D:/notes/saved.md', name: 'saved.md', modifiedTime: 42 },
    })
    setTimeout(() => {
      pending = false
      options.state.contentsRef.current = { 'file-1': BIG + '<last-keystroke>' }
    }, 20)
    const { result } = renderHook(() => useDocumentSaving(options))

    await result.current.handleSaveAs()

    expect(window.desktopAPI.document.saveAs).toHaveBeenCalledWith(BIG + '<last-keystroke>')
  })

  it('保存回执到达前出现未落账输入时，文档仍保持 dirty', async () => {
    let pending = false
    stubDesktopAPI()
    const { options, setSavedMap } = createHarness({ hasPendingChanges: () => pending })
    let resolveSave: ((result: SaveResult) => void) | undefined
    options.saveQueueApi.saveWithEncodingFallback = vi.fn(() => new Promise<SaveResult>((resolve) => {
      resolveSave = resolve
    }))
    const { result } = renderHook(() => useDocumentSaving(options))
    const saving = result.current.handleSave()
    await waitFor(() => expect(resolveSave).toBeDefined())
    pending = true
    resolveSave!({ ok: true, data: { modifiedTime: 1234 } })

    await saving

    const updates = vi.mocked(setSavedMap).mock.calls
    const update = updates[updates.length - 1]?.[0]
    expect(typeof update === 'function' && update({ 'file-1': true })['file-1']).toBe(false)
  })

  it('保存等待期间路径变更时，不把旧路径回执套用到新路径标签', async () => {
    stubDesktopAPI()
    const { options, setSavedMap, setFileMtime, setToast } = createHarness()
    let resolveSave: ((result: SaveResult) => void) | undefined
    options.saveQueueApi.saveWithEncodingFallback = vi.fn(() => new Promise<SaveResult>((resolve) => {
      resolveSave = resolve
    }))
    const { result } = renderHook(() => useDocumentSaving(options))
    const saving = result.current.handleSave()
    await waitFor(() => expect(resolveSave).toBeDefined())
    options.state.openFilesRef.current = [{ id: 'file-1', name: 'moved.md', path: 'D:/archive/moved.md' }]
    resolveSave!({ ok: true, data: { modifiedTime: 1234 } })

    await saving

    expect(setSavedMap).not.toHaveBeenCalled()
    expect(setFileMtime).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith(expect.stringContaining('路径已变更'))
  })

  it('落账等待超时不写入旧缓存，并提示用户重试', async () => {
    stubDesktopAPI()
    const { options, savedWith, setToast } = createHarness({
      hasPendingChanges: () => true,
    })
    const { result } = renderHook(() => useDocumentSaving(options))
    await result.current.handleSave()
    expect(savedWith).toHaveLength(0)
    expect(setToast).toHaveBeenCalledWith(expect.stringContaining('仍在生成快照'))
  })

  it('等待快照时切换活动文档，不向原路径写入可能过期的内容', async () => {
    let pending = true
    stubDesktopAPI()
    const { options, savedWith, setToast } = createHarness({
      hasPendingChanges: () => pending,
    })
    setTimeout(() => {
      options.state.activeFileIdRef.current = 'file-2'
      options.state.activeSessionRef.current++
      // 返回同一文件 ID 也必须失效：EditorHandle 已经历另一个会话。
      options.state.activeFileIdRef.current = 'file-1'
      options.state.activeSessionRef.current++
      pending = false
    }, 20)
    const { result } = renderHook(() => useDocumentSaving(options))
    await result.current.handleSave()
    expect(savedWith).toHaveLength(0)
    expect(setToast).toHaveBeenCalledWith(expect.stringContaining('文档已切换'))
  })

  it('关闭前快照超时会阻止关闭，也不会冲刷旧缓存', async () => {
    stubDesktopAPI()
    const { options, setToast } = createHarness({ hasPendingChanges: () => true })
    const queue = new DocumentSaveQueue<AutoSaveSnapshot>(async () => {}, 1_000)
    const flush = vi.spyOn(queue, 'flush').mockImplementation(async () => {
      options.state.initialOrSavedRef.current['file-1'] = BIG
    })
    options.saveQueueApi.saveQueueRef.current = queue
    const { result } = renderHook(() => useDocumentSaving(options))

    await expect(result.current.saveBeforeClose('file-1')).resolves.toBe(false)
    expect(flush).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith(expect.stringContaining('已取消关闭'))
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

  it('确认覆盖时传 forceOverwrite，并使用 fileMtimeRef 的最新值', async () => {
    stubDesktopAPI()
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    const { options } = createHarness()
    options.state.contents = { 'file-1': 'small' }
    options.state.contentsRef.current = { 'file-1': 'small' }
    options.state.fileMtime = { 'file-1': 100 }
    options.state.fileMtimeRef = { current: { 'file-1': 250 } }
    options.state.openFiles = [{ id: 'file-1', name: 'small.md', path: 'D:/notes/small.md' }]
    options.state.openFilesRef.current = [{ id: 'file-1', name: 'small.md', path: 'D:/notes/small.md' }]
    ;(options.editorRef as unknown as { current: Record<string, unknown> }).current.getMarkdown = () => 'small'
    const save = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'CONFLICT' } })
      .mockResolvedValueOnce({ ok: true, data: { modifiedTime: 999 } })
    options.saveQueueApi.saveWithEncodingFallback = save
    options.saveQueueApi.cancelAutoSave = vi.fn()
    const { result } = renderHook(() => useDocumentSaving(options))
    await result.current.handleSave()

    expect(save).toHaveBeenNthCalledWith(1, 'D:/notes/small.md', 'small', 250, 'file-1', true)
    expect(save).toHaveBeenNthCalledWith(
      2,
      'D:/notes/small.md',
      'small',
      undefined,
      'file-1',
      true,
      { forceOverwrite: true },
    )
    expect(options.saveQueueApi.cancelAutoSave).toHaveBeenCalled()
  })
})
