// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MutableRefObject } from 'react'
import { useDocumentRestore } from './useDocumentRestore'
import type { DocumentState } from './useDocumentState'
import type { EditorHandle } from '../../components/Editor'

afterEach(cleanup)

const refOf = <T,>(value: T): MutableRefObject<T> => ({ current: value })

/** 会话恢复只依赖 ref 与 setter；其余展示字段填默认值以满足 DocumentState 契约 */
const createState = (): { state: DocumentState; setContents: ReturnType<typeof vi.fn>; setSavedMap: ReturnType<typeof vi.fn> } => {
  const setContents = vi.fn()
  const setSavedMap = vi.fn()
  const state: DocumentState = {
    activeFile: undefined,
    activeContent: '',
    saved: true,
    documents: {},
    activeDocument: undefined,
    openFiles: [],
    contents: {},
    savedMap: {},
    activeFileId: 'welcome',
    docTitle: '欢迎',
    fileMtime: {},
    encodingMap: {},
    setOpenFiles: vi.fn(),
    setContents,
    setSavedMap,
    setActiveFileId: vi.fn(),
    setDocTitle: vi.fn(),
    setFileMtime: vi.fn(),
    setEncodingMap: vi.fn(),
    openFilesRef: refOf([]),
    contentsRef: refOf({}),
    activeFileIdRef: refOf('welcome'),
    fileMtimeRef: refOf({}),
    encodingMapRef: refOf({}),
    initialOrSavedRef: refOf({}),
  }
  return { state, setContents, setSavedMap }
}

const createHarness = () => {
  const { state, setContents, setSavedMap } = createState()
  const setToast = vi.fn()
  const replaceEditorContent = vi.fn()
  const handleOpenFolder = vi.fn(async () => {})
  const handleSelectWorkspaceFile = vi.fn(async () => true)
  const editorRef: MutableRefObject<EditorHandle | null> = refOf(null)
  return { state, setContents, setSavedMap, setToast, replaceEditorContent, handleOpenFolder, handleSelectWorkspaceFile, editorRef }
}

describe('useDocumentRestore 取消语义', () => {
  it('卸载后停止"编辑器就绪"重试链，不再写入状态或提示', async () => {
    vi.useFakeTimers()
    try {
      const h = createHarness()
      const { result, unmount } = renderHook(() =>
        useDocumentRestore({
          state: h.state,
          editorRef: h.editorRef,
          setToast: h.setToast,
          handleOpenFolder: h.handleOpenFolder,
          handleSelectWorkspaceFile: h.handleSelectWorkspaceFile,
          replaceEditorContent: h.replaceEditorContent,
        }),
      )

      // 空会话：恢复流程随即进入 100ms×20 的编辑器就绪重试链
      await act(async () => {
        void result.current.restoreFromSessionData(null, {})
      })

      unmount()
      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      // 未加取消守卫时，重试会跑满 20 次并落到"编辑器未就绪"提示
      expect(h.setToast).not.toHaveBeenCalled()
      expect(h.replaceEditorContent).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('重复触发恢复时，旧一轮在下一个 await 之后不再写入状态', async () => {
    const h = createHarness()

    let resolveFirstRead: (value: unknown) => void = () => {}
    const firstRead = new Promise((resolve) => {
      resolveFirstRead = resolve
    })
    const read = vi
      .fn()
      .mockReturnValueOnce(firstRead)
      .mockResolvedValueOnce({
        ok: true,
        data: { name: 'b.md', content: 'B', modifiedTime: 2, encoding: 'UTF-8' },
      })
    const stat = vi.fn(async () => ({ ok: true, data: null }))
    const desktopAPI = { document: { read, stat } }
    Object.defineProperty(window, 'desktopAPI', { value: desktopAPI, configurable: true })

    const { result } = renderHook(() =>
      useDocumentRestore({
        state: h.state,
        editorRef: h.editorRef,
        setToast: h.setToast,
        handleOpenFolder: h.handleOpenFolder,
        handleSelectWorkspaceFile: h.handleSelectWorkspaceFile,
        replaceEditorContent: h.replaceEditorContent,
      }),
    )

    const session = { files: [{ id: 'file-x', name: 'b.md', path: '/tmp/ws/b.md' }] }

    // 第一轮挂在 document.read 上；第二轮立刻完成
    let firstRun: Promise<void> | undefined
    await act(async () => {
      firstRun = result.current.restoreFromSessionData(session, {})
      await Promise.resolve()
    })
    await act(async () => {
      await result.current.restoreFromSessionData(session, {})
    })
    expect(h.setContents).toHaveBeenCalledTimes(1)

    // 第一轮迟到返回：run 已过期，不得再写入
    await act(async () => {
      resolveFirstRead({
        ok: true,
        data: { name: 'a.md', content: 'A', modifiedTime: 1, encoding: 'UTF-8' },
      })
      await firstRun
    })
    expect(h.setContents).toHaveBeenCalledTimes(1)
    // setContents 以函数式更新提交，需自行应用 updater 才能看到写入的内容
    const updater = h.setContents.mock.calls[0][0]
    const payload =
      typeof updater === 'function'
        ? (updater as (prev: Record<string, string>) => Record<string, string>)({})
        : (updater as Record<string, string>)
    expect(payload['file-x']).toBe('B')
  })
})
