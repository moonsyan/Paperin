// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAppActions } from './useAppActions'

afterEach(() => { vi.restoreAllMocks() })

function createOpts(overrides: Record<string, unknown> = {}) {
  const noop = vi.fn()
  const noopAsync = vi.fn().mockResolvedValue(undefined)
  const ref = { current: undefined }
  return {
    editorRef: ref as never,
    docTitle: 'untitled',
    setDocTitle: vi.fn(),
    activeFileId: 'f1',
    activeFileIdRef: { current: 'f1' },
    openFiles: [{ id: 'f1', name: 'untitled', path: '/tmp/a.md' }],
    openFilesRef: { current: [{ id: 'f1', name: 'untitled', path: '/tmp/a.md' }] },
    setOpenFiles: vi.fn(),
    demoFileNames: {},
    activeFilePath: '/tmp/a.md',
    workspacePathRef: { current: '/workspace' },
    focusEditorSoon: noop,
    setToast: vi.fn(),
    handleNew: noopAsync,
    handleOpen: noopAsync,
    handleOpenFolder: noopAsync,
    handleSelectWorkspaceFile: vi.fn().mockResolvedValue(true),
    handleSave: noopAsync,
    handleSaveAs: noopAsync,
    handleCloseTab: vi.fn().mockResolvedValue(undefined),
    handleCloseOtherTabs: vi.fn(),
    handleCloseAllTabs: vi.fn(),
    handleRenameFile: vi.fn().mockResolvedValue(undefined),
    handleExportHtml: noopAsync,
    handleExportMarkdown: noopAsync,
    handleExportPandoc: noopAsync,
    handleExportDocx: noopAsync,
    setSearchMode: vi.fn(),
    setFocusOutlineTick: vi.fn(),
    setSidebarActiveTab: vi.fn(),
    setContextDockState: vi.fn(),
    setSearchPref: vi.fn(),
    setSearchEpoch: vi.fn(),
    setSidebarCollapsed: vi.fn(),
    setFocusMode: vi.fn(),
    setPreviewMode: vi.fn(),
    setTypewriter: vi.fn(),
    setZoom: vi.fn(),
    centerCaret: vi.fn(),
    setSettingsOpen: vi.fn(),
    setHelpView: vi.fn(),
    setImagesOpen: vi.fn(),
    setPdfOptsOpen: vi.fn(),
    setWsSearchOpen: vi.fn(),
    setPaletteOpen: vi.fn(),
    setVersionHistoryOpen: vi.fn(),
    openGraphView: vi.fn(),
    getLayoutState: vi.fn(() => ({ activeView: 'files' as const, sidebarWidth: 260, typewriterMode: false })),
    setSidebarWidth: vi.fn(),
    setPublishOpen: vi.fn(),
    ...overrides,
  } as Parameters<typeof useAppActions>[0]
}

describe('useAppActions', () => {
  describe('handleAction 分发', () => {
    it('Context Dock 面板命令会展开并选择对应面板', () => {
      const setContextDockState = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setContextDockState })))

      act(() => result.current.handleAction('linksPanel'))
      act(() => result.current.handleAction('tagsPanel'))
      act(() => result.current.handleAction('propertiesPanel'))
      act(() => result.current.handleAction('qualityPanel'))

      expect(setContextDockState).toHaveBeenCalledTimes(4)
      const updates = setContextDockState.mock.calls.map(([update]) =>
        (update as (state: { visibility: string; panel: string }) => { visibility: string; panel: string })({ visibility: 'collapsed', panel: 'outline' }),
      )
      expect(updates.map((state) => state.panel)).toEqual(['links', 'tags', 'properties', 'quality'])
      expect(updates.every((state) => state.visibility === 'expanded')).toBe(true)
    })

    it('new → handleNew', () => {
      const handleNew = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ handleNew })))
      act(() => result.current.handleAction('new'))
      expect(handleNew).toHaveBeenCalledOnce()
    })

    it('save → handleSave', () => {
      const handleSave = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useAppActions(createOpts({ handleSave })))
      act(() => result.current.handleAction('save'))
      expect(handleSave).toHaveBeenCalledOnce()
    })

    it('layout.preset.* → 应用内置预设（切视图/宽度/打字机，不动标签）', () => {
      const setSidebarActiveTab = vi.fn()
      const setContextDockState = vi.fn()
      const setSidebarWidth = vi.fn()
      const setTypewriter = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setSidebarActiveTab, setContextDockState, setSidebarWidth, setTypewriter })),
      )
      act(() => result.current.handleAction('layout.preset.writing'))
      expect(setSidebarActiveTab).toHaveBeenCalledWith('files')
      expect(setContextDockState).toHaveBeenCalledOnce()
      const writingDock = setContextDockState.mock.calls[0][0] as (state: { panel: string; visibility: string }) => { panel: string; visibility: string }
      expect(writingDock({ panel: 'quality', visibility: 'collapsed' })).toEqual({ panel: 'outline', visibility: 'expanded' })
      expect(setSidebarWidth).toHaveBeenCalledWith(280)
      expect(setTypewriter).toHaveBeenCalledWith(true)
      // 知识库预设：文件树视图、打字机保持现状（toggles 空 → 现状 false）
      act(() => result.current.handleAction('layout.preset.knowledge'))
      expect(setSidebarActiveTab).toHaveBeenLastCalledWith('files')
    })

    it('closeTab → handleCloseTab(activeFileId)', () => {
      const handleCloseTab = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() =>
        useAppActions(createOpts({ handleCloseTab, activeFileId: 'f1' })),
      )
      act(() => result.current.handleAction('closeTab'))
      expect(handleCloseTab).toHaveBeenCalledWith('f1')
    })

    it('closeOtherTabs → handleCloseOtherTabs(activeFileIdRef)', () => {
      const handleCloseOtherTabs = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ handleCloseOtherTabs, activeFileIdRef: { current: 'f2' } })),
      )
      act(() => result.current.handleAction('closeOtherTabs'))
      expect(handleCloseOtherTabs).toHaveBeenCalledWith('f2')
    })

    it('closeAllTabs → handleCloseAllTabs', () => {
      const handleCloseAllTabs = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ handleCloseAllTabs })))
      act(() => result.current.handleAction('closeAllTabs'))
      expect(handleCloseAllTabs).toHaveBeenCalledOnce()
    })

    it('images → setImagesOpen(true)', () => {
      const setImagesOpen = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setImagesOpen })))
      act(() => result.current.handleAction('images'))
      expect(setImagesOpen).toHaveBeenCalledWith(true)
    })

    it('find → setSearchMode(find)', () => {
      const setSearchMode = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setSearchMode })))
      act(() => result.current.handleAction('find'))
      expect(setSearchMode).toHaveBeenCalledWith('find')
    })

    it('replace → setSearchMode(replace)', () => {
      const setSearchMode = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setSearchMode })))
      act(() => result.current.handleAction('replace'))
      expect(setSearchMode).toHaveBeenCalledWith('replace')
    })

    it('exportPdf → setPdfOptsOpen(true)', () => {
      const setPdfOptsOpen = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setPdfOptsOpen })))
      act(() => result.current.handleAction('exportPdf'))
      expect(setPdfOptsOpen).toHaveBeenCalledWith(true)
    })

    it('toggleSidebar → setSidebarCollapsed 取反', () => {
      const setSidebarCollapsed = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setSidebarCollapsed })))
      act(() => result.current.handleAction('toggleSidebar'))
      expect(setSidebarCollapsed).toHaveBeenCalledWith(expect.any(Function))
      expect(setSidebarCollapsed.mock.calls[0][0](false)).toBe(true)
    })

    it('toggleFocus → setFocusMode 取反', () => {
      const setFocusMode = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setFocusMode })))
      act(() => result.current.handleAction('toggleFocus'))
      expect(setFocusMode).toHaveBeenCalledWith(expect.any(Function))
    })

    it('togglePreview → setPreviewMode 取反', () => {
      const setPreviewMode = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setPreviewMode })))
      act(() => result.current.handleAction('togglePreview'))
      expect(setPreviewMode).toHaveBeenCalledWith(expect.any(Function))
    })

    it('zoomIn → setZoom 递增', () => {
      const setZoom = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setZoom })))
      act(() => result.current.handleAction('zoomIn'))
      expect(setZoom).toHaveBeenCalledWith(expect.any(Function))
      expect(setZoom.mock.calls[0][0](1)).toBe(1.1)
    })

    it('zoomOut → setZoom 递减', () => {
      const setZoom = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setZoom })))
      act(() => result.current.handleAction('zoomOut'))
      expect(setZoom).toHaveBeenCalledWith(expect.any(Function))
      expect(setZoom.mock.calls[0][0](1)).toBe(0.9)
    })

    it('zoomReset → setZoom(1)', () => {
      const setZoom = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setZoom })))
      act(() => result.current.handleAction('zoomReset'))
      expect(setZoom).toHaveBeenCalledWith(1)
    })

    it('typewriter → setTypewriter 取反', () => {
      const setTypewriter = vi.fn()
      const centerCaret = vi.fn()
      vi.useFakeTimers()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setTypewriter, centerCaret })),
      )
      act(() => result.current.handleAction('typewriter'))
      expect(setTypewriter).toHaveBeenCalledWith(expect.any(Function))
      const updater = setTypewriter.mock.calls[0][0] as (v: boolean) => boolean
      expect(updater(false)).toBe(true)
      act(() => vi.advanceTimersByTime(0))
      expect(centerCaret).toHaveBeenCalledOnce()
      vi.useRealTimers()
    })

    it('settings → setSettingsOpen(true)', () => {
      const setSettingsOpen = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setSettingsOpen })))
      act(() => result.current.handleAction('settings'))
      expect(setSettingsOpen).toHaveBeenCalledWith(true)
    })

    it('shortcuts → setHelpView(shortcuts)', () => {
      const setHelpView = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setHelpView })))
      act(() => result.current.handleAction('shortcuts'))
      expect(setHelpView).toHaveBeenCalledWith('shortcuts')
    })

    it('markdown → setHelpView(syntax)', () => {
      const setHelpView = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setHelpView })))
      act(() => result.current.handleAction('markdown'))
      expect(setHelpView).toHaveBeenCalledWith('syntax')
    })

    it('about → setHelpView(about)', () => {
      const setHelpView = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setHelpView })))
      act(() => result.current.handleAction('about'))
      expect(setHelpView).toHaveBeenCalledWith('about')
    })

    it('stats → setHelpView(stats)', () => {
      const setHelpView = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setHelpView })))
      act(() => result.current.handleAction('stats'))
      expect(setHelpView).toHaveBeenCalledWith('stats')
    })

    it('commandPalette → setPaletteOpen(true)', () => {
      const setPaletteOpen = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setPaletteOpen })))
      act(() => result.current.handleAction('commandPalette'))
      expect(setPaletteOpen).toHaveBeenCalledWith(true)
    })

    it('linksPanel → 展开 Context Dock 并切到 links', () => {
      const setSidebarCollapsed = vi.fn()
      const setSidebarActiveTab = vi.fn()
      const setContextDockState = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setSidebarCollapsed, setSidebarActiveTab, setContextDockState })),
      )
      act(() => result.current.handleAction('linksPanel'))
      expect(setSidebarCollapsed).not.toHaveBeenCalled()
      expect(setSidebarActiveTab).not.toHaveBeenCalledWith('links')
      const update = setContextDockState.mock.calls[0][0] as (state: { panel: string; visibility: string }) => { panel: string; visibility: string }
      expect(update({ panel: 'outline', visibility: 'collapsed' })).toMatchObject({ panel: 'links', visibility: 'expanded' })
    })

    it('wsSearch + 有工作区 → setWsSearchOpen(true)', () => {
      const setWsSearchOpen = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setWsSearchOpen, workspacePathRef: { current: '/ws' } })),
      )
      act(() => result.current.handleAction('wsSearch'))
      expect(setWsSearchOpen).toHaveBeenCalledWith(true)
    })

    it('wsSearch + 无工作区 → setToast 提示', () => {
      const setToast = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setToast, workspacePathRef: { current: undefined } })),
      )
      act(() => result.current.handleAction('wsSearch'))
      expect(setToast).toHaveBeenCalledWith('请先打开文件夹（工作区）后再使用全文搜索')
    })

    it('versionHistory + 有路径 → setVersionHistoryOpen(true)', () => {
      const setVersionHistoryOpen = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setVersionHistoryOpen, activeFilePath: '/tmp/a.md' })),
      )
      act(() => result.current.handleAction('versionHistory'))
      expect(setVersionHistoryOpen).toHaveBeenCalledWith(true)
    })

    it('versionHistory + 无路径 → setToast', () => {
      const setToast = vi.fn()
      const setVersionHistoryOpen = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setToast, setVersionHistoryOpen, activeFilePath: undefined })),
      )
      act(() => result.current.handleAction('versionHistory'))
      expect(setToast).toHaveBeenCalledWith('当前文档尚未保存到磁盘，暂无版本历史')
      expect(setVersionHistoryOpen).not.toHaveBeenCalled()
    })

    it('graph → 委托 openGraphView（工作区校验与刷新在 useGraphView）', () => {
      const openGraphView = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ openGraphView })))

      act(() => result.current.handleAction('graph'))

      expect(openGraphView).toHaveBeenCalledOnce()
    })

    it('handleOpenGraphView 直接暴露 openGraphView', () => {
      const openGraphView = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ openGraphView })))

      act(() => result.current.handleOpenGraphView())

      expect(openGraphView).toHaveBeenCalledOnce()
    })

    it('outline → openOutlinePanel', () => {
      const setSidebarCollapsed = vi.fn()
      const setFocusOutlineTick = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setSidebarCollapsed, setFocusOutlineTick })),
      )
      act(() => result.current.handleAction('outline'))
      expect(setSidebarCollapsed).toHaveBeenCalledWith(false)
    })

    it('openRecent:xxx → handleSelectWorkspaceFile(xxx)', () => {
      const handleSelectWorkspaceFile = vi.fn().mockResolvedValue(true)
      const { result } = renderHook(() =>
        useAppActions(createOpts({ handleSelectWorkspaceFile })),
      )
      act(() => result.current.handleAction('openRecent:/tmp/b.md'))
      expect(handleSelectWorkspaceFile).toHaveBeenCalledWith('/tmp/b.md')
    })

    it('未知 action 不崩溃', () => {
      const { result } = renderHook(() => useAppActions(createOpts()))
      expect(() => result.current.handleAction('unknownAction')).not.toThrow()
    })
  })

  describe('openOutlinePanel', () => {
    it('展开侧栏并延迟递增 focusOutlineTick', () => {
      vi.useFakeTimers()
      const setSidebarCollapsed = vi.fn()
      const setFocusOutlineTick = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setSidebarCollapsed, setFocusOutlineTick })),
      )
      act(() => result.current.openOutlinePanel())
      expect(setSidebarCollapsed).toHaveBeenCalledWith(false)
      expect(setFocusOutlineTick).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(0))
      expect(setFocusOutlineTick).toHaveBeenCalledWith(expect.any(Function))
      vi.useRealTimers()
    })
  })

  describe('close 系列函数', () => {
    it('closeSettings → setSettingsOpen(false) + focusEditorSoon', () => {
      const focusEditorSoon = vi.fn()
      const setSettingsOpen = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ focusEditorSoon, setSettingsOpen })),
      )
      act(() => result.current.closeSettings())
      expect(setSettingsOpen).toHaveBeenCalledWith(false)
      expect(focusEditorSoon).toHaveBeenCalledOnce()
    })

    it('closeHelp → setHelpView(null) + focusEditorSoon', () => {
      const focusEditorSoon = vi.fn()
      const setHelpView = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ focusEditorSoon, setHelpView })),
      )
      act(() => result.current.closeHelp())
      expect(setHelpView).toHaveBeenCalledWith(null)
      expect(focusEditorSoon).toHaveBeenCalledOnce()
    })

    it('closeImages → setImagesOpen(false)', () => {
      const focusEditorSoon = vi.fn()
      const setImagesOpen = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ focusEditorSoon, setImagesOpen })),
      )
      act(() => result.current.closeImages())
      expect(setImagesOpen).toHaveBeenCalledWith(false)
      expect(focusEditorSoon).toHaveBeenCalledOnce()
    })

    it('closePdfOptions → setPdfOptsOpen(false)', () => {
      const focusEditorSoon = vi.fn()
      const setPdfOptsOpen = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ focusEditorSoon, setPdfOptsOpen })),
      )
      act(() => result.current.closePdfOptions())
      expect(setPdfOptsOpen).toHaveBeenCalledWith(false)
      expect(focusEditorSoon).toHaveBeenCalledOnce()
    })

    it('closeWorkspaceSearch → setWsSearchOpen(false)', () => {
      const focusEditorSoon = vi.fn()
      const setWsSearchOpen = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ focusEditorSoon, setWsSearchOpen })),
      )
      act(() => result.current.closeWorkspaceSearch())
      expect(setWsSearchOpen).toHaveBeenCalledWith(false)
      expect(focusEditorSoon).toHaveBeenCalledOnce()
    })

    it('closePalette → setPaletteOpen(false)', () => {
      const focusEditorSoon = vi.fn()
      const setPaletteOpen = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ focusEditorSoon, setPaletteOpen })),
      )
      act(() => result.current.closePalette())
      expect(setPaletteOpen).toHaveBeenCalledWith(false)
      expect(focusEditorSoon).toHaveBeenCalledOnce()
    })

    it('closeVersionHistory → setVersionHistoryOpen(false)', () => {
      const focusEditorSoon = vi.fn()
      const setVersionHistoryOpen = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ focusEditorSoon, setVersionHistoryOpen })),
      )
      act(() => result.current.closeVersionHistory())
      expect(setVersionHistoryOpen).toHaveBeenCalledWith(false)
      expect(focusEditorSoon).toHaveBeenCalledOnce()
    })
  })

  describe('handleDocumentTitleKeyDown', () => {
    function makeKeyEvent(key: string) {
      return {
        key,
        nativeEvent: new KeyboardEvent('keydown'),
        preventDefault: vi.fn(),
        currentTarget: {
          textContent: 'new-name',
          blur: vi.fn(),
        },
      } as unknown as React.KeyboardEvent<HTMLDivElement>
    }

    it('Escape → 还原标题并 blur', () => {
      const setDocTitle = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setDocTitle, docTitle: 'original' })),
      )
      const event = makeKeyEvent('Escape')
      act(() => result.current.handleDocumentTitleKeyDown(event))
      expect(event.preventDefault).toHaveBeenCalledOnce()
      expect(event.currentTarget.textContent).toBe('original')
      expect((event.currentTarget as unknown as { blur: ReturnType<typeof vi.fn> }).blur).toHaveBeenCalledOnce()
    })

    it('Enter → blur', () => {
      const { result } = renderHook(() => useAppActions(createOpts()))
      const event = makeKeyEvent('Enter')
      act(() => result.current.handleDocumentTitleKeyDown(event))
      expect(event.preventDefault).toHaveBeenCalledOnce()
      expect((event.currentTarget as unknown as { blur: ReturnType<typeof vi.fn> }).blur).toHaveBeenCalledOnce()
    })
  })

  describe('handleDocumentTitleBlur', () => {
    function makeBlurEvent(textContent: string) {
      return {
        currentTarget: { textContent },
      } as unknown as React.FocusEvent<HTMLDivElement>
    }

    it('空标题 → setToast', () => {
      const setToast = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({ setToast, openFiles: [], activeFileId: 'f1' })),
      )
      act(() => result.current.handleDocumentTitleBlur(makeBlurEvent('')))
      expect(setToast).toHaveBeenCalledWith('文件名不能为空')
    })

    it('同名 → 不触发任何操作', () => {
      const setDocTitle = vi.fn()
      const handleRenameFile = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({
          setDocTitle, handleRenameFile,
          openFiles: [{ id: 'f1', name: 'same', path: '/a.md' }],
          activeFileId: 'f1', docTitle: 'same',
        })),
      )
      act(() => result.current.handleDocumentTitleBlur(makeBlurEvent('same')))
      expect(setDocTitle).not.toHaveBeenCalled()
      expect(handleRenameFile).not.toHaveBeenCalled()
    })

    it('有路径文件 → handleRenameFile', () => {
      const handleRenameFile = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() =>
        useAppActions(createOpts({
          handleRenameFile,
          openFiles: [{ id: 'f1', name: 'old', path: '/tmp/old.md' }],
          activeFileId: 'f1',
        })),
      )
      act(() => result.current.handleDocumentTitleBlur(makeBlurEvent('new')))
      expect(handleRenameFile).toHaveBeenCalledWith('/tmp/old.md', 'new')
    })

    it('演示文档 → setToast 不支持重命名', () => {
      const setToast = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({
          setToast,
          openFiles: [{ id: 'demo1', name: 'welcome' }],
          activeFileId: 'demo1',
          demoFileNames: { demo1: 'welcome' },
        })),
      )
      act(() => result.current.handleDocumentTitleBlur(makeBlurEvent('renamed')))
      expect(setToast).toHaveBeenCalledWith('演示文档不支持重命名')
    })

    it('无路径非演示 → setDocTitle + setOpenFiles 更新内存', () => {
      const setDocTitle = vi.fn()
      const setOpenFiles = vi.fn()
      const openFilesRef = { current: [{ id: 'f1', name: 'old' }] }
      const { result } = renderHook(() =>
        useAppActions(createOpts({
          setDocTitle, setOpenFiles, openFilesRef,
          openFiles: [{ id: 'f1', name: 'old' }],
          activeFileId: 'f1',
        })),
      )
      act(() => result.current.handleDocumentTitleBlur(makeBlurEvent('new')))
      expect(setDocTitle).toHaveBeenCalledWith('new')
      expect(setOpenFiles).toHaveBeenCalledOnce()
    })
  })

  describe('handleOpenBacklink', () => {
    it('打开文件后设置搜索', async () => {
      const handleSelectWorkspaceFile = vi.fn().mockResolvedValue(true)
      const setSearchPref = vi.fn()
      const setSearchEpoch = vi.fn()
      const setSearchMode = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({
          handleSelectWorkspaceFile, setSearchPref, setSearchEpoch, setSearchMode,
        })),
      )
      act(() => result.current.handleOpenBacklink('/file.md', 'query'))
      await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
      expect(handleSelectWorkspaceFile).toHaveBeenCalledWith('/file.md', undefined)
      expect(setSearchPref).toHaveBeenCalledOnce()
      expect(setSearchEpoch).toHaveBeenCalledOnce()
      expect(setSearchMode).toHaveBeenCalledWith('find')
    })

    it('空 query → 不触发搜索', async () => {
      const handleSelectWorkspaceFile = vi.fn().mockResolvedValue(true)
      const setSearchPref = vi.fn()
      const setSearchEpoch = vi.fn()
      const setSearchMode = vi.fn()
      const { result } = renderHook(() =>
        useAppActions(createOpts({
          handleSelectWorkspaceFile, setSearchPref, setSearchEpoch, setSearchMode,
        })),
      )
      act(() => result.current.handleOpenBacklink('/file.md', ''))
      await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
      expect(setSearchPref).not.toHaveBeenCalled()
      expect(setSearchEpoch).not.toHaveBeenCalled()
      expect(setSearchMode).not.toHaveBeenCalled()
    })
  })

  describe('handleExportPdf', () => {
    it('exportPdf 命令打开 PDF 选项弹窗', () => {
      const setPdfOptsOpen = vi.fn()
      const { result } = renderHook(() => useAppActions(createOpts({ setPdfOptsOpen })))
      act(() => result.current.handleAction('exportPdf'))
      expect(setPdfOptsOpen).toHaveBeenCalledWith(true)
    })
  })
})
