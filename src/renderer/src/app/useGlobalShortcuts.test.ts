// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../data/shortcuts', () => ({
  comboFromEvent: vi.fn(),
}))

import { useGlobalShortcuts } from './useGlobalShortcuts'
import { comboFromEvent } from '../data/shortcuts'

const mockedCombo = vi.mocked(comboFromEvent)

afterEach(() => {
  vi.restoreAllMocks()
})

function createOpts(overrides: Record<string, unknown> = {}) {
  const noop = vi.fn()
  return {
    shortcutLookupRef: { current: {} as Record<string, string> },
    modalOpenRef: { current: false },
    fullscreenOpenRef: { current: false },
    editorRef: { current: null },
    activeFileIdRef: { current: 'f1' },
    handleNew: noop,
    handleOpen: noop,
    handleOpenFolder: noop,
    handleSave: noop,
    handleSaveAs: noop,
    handleCloseTab: noop,
    openOutlinePanel: noop,
    setPaletteOpen: vi.fn(),
    setSearchMode: vi.fn(),
    setSidebarCollapsed: vi.fn(),
    setPreviewMode: vi.fn(),
    setZoom: vi.fn(),
    setFocusMode: vi.fn(),
    ...overrides,
  } as Parameters<typeof useGlobalShortcuts>[0]
}

function dispatchKey(combo: string) {
  const event = new KeyboardEvent('keydown', { key: 'k', bubbles: true })
  mockedCombo.mockReturnValue(combo)
  window.dispatchEvent(event)
}

describe('useGlobalShortcuts', () => {
  it('注册 keydown 监听，卸载后移除', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useGlobalShortcuts(createOpts()))
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('模态框打开时不响应快捷键', () => {
    const handleNew = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleNew,
      modalOpenRef: { current: true },
      shortcutLookupRef: { current: { 'Ctrl+N': 'new' } },
    })))
    dispatchKey('Ctrl+N')
    expect(handleNew).not.toHaveBeenCalled()
  })

  it('comboFromEvent 返回空串时不触发', () => {
    const handleNew = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleNew,
      shortcutLookupRef: { current: { 'Ctrl+N': 'new' } },
    })))
    dispatchKey('')
    expect(handleNew).not.toHaveBeenCalled()
  })

  it('defaultPrevented 不触发', () => {
    const handleNew = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleNew,
      shortcutLookupRef: { current: { 'Ctrl+N': 'new' } },
    })))
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })
    const preventer = (e: Event) => { e.preventDefault() }
    window.addEventListener('keydown', preventer, { capture: true })
    window.dispatchEvent(event)
    window.removeEventListener('keydown', preventer, { capture: true })
    expect(handleNew).not.toHaveBeenCalled()
  })

  it('repeat 不触发', () => {
    const handleNew = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleNew,
      shortcutLookupRef: { current: { 'Ctrl+N': 'new' } },
    })))
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, repeat: true, bubbles: true })
    window.dispatchEvent(event)
    expect(handleNew).not.toHaveBeenCalled()
  })

  it('匹配快捷键表时调用对应 handler', () => {
    const handleSave = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleSave,
      shortcutLookupRef: { current: { 'Ctrl+S': 'save' } },
    })))
    dispatchKey('Ctrl+S')
    expect(handleSave).toHaveBeenCalledOnce()
  })

  it('未匹配快捷键表时不调用任何 handler', () => {
    const handleNew = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleNew,
      shortcutLookupRef: { current: {} },
    })))
    dispatchKey('Ctrl+X')
    expect(handleNew).not.toHaveBeenCalled()
  })

  it('find → setSearchMode(find)', () => {
    const setSearchMode = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      setSearchMode,
      shortcutLookupRef: { current: { 'Ctrl+F': 'find' } },
    })))
    dispatchKey('Ctrl+F')
    expect(setSearchMode).toHaveBeenCalledWith('find')
  })

  it('replace → setSearchMode(replace)', () => {
    const setSearchMode = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      setSearchMode,
      shortcutLookupRef: { current: { 'Ctrl+H': 'replace' } },
    })))
    dispatchKey('Ctrl+H')
    expect(setSearchMode).toHaveBeenCalledWith('replace')
  })

  it('全屏模式下不触发 find/replace', () => {
    const setSearchMode = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      setSearchMode,
      fullscreenOpenRef: { current: true },
      shortcutLookupRef: { current: { 'Ctrl+F': 'find', 'Ctrl+H': 'replace' } },
    })))
    dispatchKey('Ctrl+F')
    dispatchKey('Ctrl+H')
    expect(setSearchMode).not.toHaveBeenCalled()
  })

  it('toggleSidebar → setSidebarCollapsed 取反', () => {
    const setSidebarCollapsed = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      setSidebarCollapsed,
      shortcutLookupRef: { current: { 'Ctrl+J': 'toggleSidebar' } },
    })))
    dispatchKey('Ctrl+J')
    expect(setSidebarCollapsed).toHaveBeenCalledWith(expect.any(Function))
  })

  it('zoomIn → setZoom 递增', () => {
    const setZoom = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      setZoom,
      shortcutLookupRef: { current: { 'Ctrl+=': 'zoomIn' } },
    })))
    dispatchKey('Ctrl+=')
    expect(setZoom).toHaveBeenCalledWith(expect.any(Function))
    expect(setZoom.mock.calls[0][0](1)).toBe(1.1)
  })

  it('zoomOut → setZoom 递减', () => {
    const setZoom = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      setZoom,
      shortcutLookupRef: { current: { 'Ctrl+-': 'zoomOut' } },
    })))
    dispatchKey('Ctrl+-')
    expect(setZoom).toHaveBeenCalledWith(expect.any(Function))
    expect(setZoom.mock.calls[0][0](1)).toBe(0.9)
  })

  it('focusMode → setFocusMode 取反', () => {
    const setFocusMode = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      setFocusMode,
      shortcutLookupRef: { current: { 'F11': 'focusMode' } },
    })))
    dispatchKey('F11')
    expect(setFocusMode).toHaveBeenCalledWith(expect.any(Function))
  })

  it('preview → setPreviewMode 取反', () => {
    const setPreviewMode = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      setPreviewMode,
      shortcutLookupRef: { current: { 'Ctrl+Shift+P': 'preview' } },
    })))
    dispatchKey('Ctrl+Shift+P')
    expect(setPreviewMode).toHaveBeenCalledWith(expect.any(Function))
  })

  it('outline → openOutlinePanel', () => {
    const openOutlinePanel = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      openOutlinePanel,
      shortcutLookupRef: { current: { 'Ctrl+Shift+L': 'outline' } },
    })))
    dispatchKey('Ctrl+Shift+L')
    expect(openOutlinePanel).toHaveBeenCalledOnce()
  })

  it('commandPalette → setPaletteOpen(true)', () => {
    const setPaletteOpen = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      setPaletteOpen,
      shortcutLookupRef: { current: { 'Ctrl+P': 'commandPalette' } },
    })))
    dispatchKey('Ctrl+P')
    expect(setPaletteOpen).toHaveBeenCalledWith(true)
  })

  it('closeTab → handleCloseTab(activeFileIdRef)', () => {
    const handleCloseTab = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleCloseTab,
      activeFileIdRef: { current: 'f2' },
      shortcutLookupRef: { current: { 'Ctrl+W': 'closeTab' } },
    })))
    dispatchKey('Ctrl+W')
    expect(handleCloseTab).toHaveBeenCalledWith('f2')
  })

  it('new → handleNew', () => {
    const handleNew = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleNew,
      shortcutLookupRef: { current: { 'Ctrl+N': 'new' } },
    })))
    dispatchKey('Ctrl+N')
    expect(handleNew).toHaveBeenCalledOnce()
  })

  it('open → handleOpen', () => {
    const handleOpen = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleOpen,
      shortcutLookupRef: { current: { 'Ctrl+O': 'open' } },
    })))
    dispatchKey('Ctrl+O')
    expect(handleOpen).toHaveBeenCalledOnce()
  })

  it('saveAs → handleSaveAs', () => {
    const handleSaveAs = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleSaveAs,
      shortcutLookupRef: { current: { 'Ctrl+Shift+S': 'saveAs' } },
    })))
    dispatchKey('Ctrl+Shift+S')
    expect(handleSaveAs).toHaveBeenCalledOnce()
  })

  it('openFolder → handleOpenFolder', () => {
    const handleOpenFolder = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      handleOpenFolder,
      shortcutLookupRef: { current: { 'Ctrl+Shift+O': 'openFolder' } },
    })))
    dispatchKey('Ctrl+Shift+O')
    expect(handleOpenFolder).toHaveBeenCalledOnce()
  })
})
