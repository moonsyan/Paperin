// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MutableRefObject } from 'react'
import { useCommandRegistry } from './useCommandRegistry'
import { BUILT_IN_LAYOUT_PRESETS } from '../workspace/layout-preset'
import type { AppliedLayoutState } from '../workspace/layout-preset'
import type { ActionHandlers } from './commands'

const makeActionHandlers = (overrides: Partial<ActionHandlers> = {}): ActionHandlers => ({
  handleNew: vi.fn(),
  handleOpen: vi.fn(async () => {}),
  handleOpenFolder: vi.fn(async () => {}),
  handleSaveAs: vi.fn(async () => {}),
  handleCloseTab: vi.fn(async () => {}),
  handleCloseOtherTabs: vi.fn(),
  handleCloseAllTabs: vi.fn(),
  handleExportHtml: vi.fn(async () => {}),
  handleExportMarkdown: vi.fn(async () => {}),
  handleExportPandoc: vi.fn(async () => {}),
  handleExportDocx: vi.fn(async () => {}),
  setPdfOptsOpen: vi.fn(),
  openOutlinePanel: vi.fn(),
  openContextPanel: vi.fn(),
  handleOpenVersionHistory: vi.fn(),
  openGraphView: vi.fn(),
  setSearchMode: vi.fn(),
  setImagesOpen: vi.fn(),
  setPublishOpen: vi.fn(),
  setWsSearchOpen: vi.fn(),
  setPaletteOpen: vi.fn(),
  setSettingsOpen: vi.fn(),
  setSupportSummaryOpen: vi.fn(),
  setHelpView: vi.fn(),
  setSidebarCollapsed: vi.fn(),
  setFocusMode: vi.fn(),
  setPreviewMode: vi.fn(),
  setTypewriter: vi.fn(),
  setZoom: vi.fn(),
  setToast: vi.fn(),
  centerCaret: vi.fn(),
  activeFileIdRef: { current: 'file-1' },
  workspacePathRef: { current: '/tmp/ws' },
  ...overrides,
})

const makeOptions = (overrides: Partial<Parameters<typeof useCommandRegistry>[0]> = {}) => {
  const workspacePathRef: MutableRefObject<string | undefined> = { current: '/tmp/ws' }
  const base: Parameters<typeof useCommandRegistry>[0] = {
    handleSave: vi.fn(async () => {}),
    getLayoutState: vi.fn(
      (): AppliedLayoutState => ({
        activeView: 'files',
        sidebarWidth: 260,
        typewriterMode: false,
      }),
    ),
    setTypewriter: vi.fn(),
    setSidebarActiveTab: vi.fn(),
    setContextDockState: vi.fn(),
    setSidebarWidth: vi.fn(),
    centerCaret: vi.fn(),
    activeFileId: 'file-1',
    workspacePathRef,
    getHasUnsavedChanges: vi.fn(() => false),
    actionHandlers: makeActionHandlers(),
  }
  return { ...base, ...overrides }
}

describe('useCommandRegistry', () => {
  it('首次渲染即注册 save 与全部布局预设命令', () => {
    const { result } = renderHook(() => useCommandRegistry(makeOptions()))
    const registry = result.current.commandRegistry
    expect(registry).not.toBeNull()
    expect(registry!.get('save')).toBeDefined()
    for (const preset of BUILT_IN_LAYOUT_PRESETS) {
      expect(registry!.get(`layout.preset.${preset.id}`)).toBeDefined()
    }
  })

  it('重复渲染不会二次注册（StrictMode 双渲染保护）', () => {
    const { result, rerender } = renderHook(() => useCommandRegistry(makeOptions()))
    const firstRegistry = result.current.commandRegistry
    rerender()
    // 开发期重复注册会抛错；这里断言引用未变即可证明注册路径未再进入
    expect(result.current.commandRegistry).toBe(firstRegistry)
  })

  it('runCommand("save") 调用最新 handleSave（经 ref 转发）', async () => {
    const firstSave = vi.fn(async () => {})
    const { result, rerender } = renderHook(
      ({ handleSave }: { handleSave: () => Promise<void> }) =>
        useCommandRegistry(makeOptions({ handleSave })),
      { initialProps: { handleSave: firstSave } },
    )

    const secondSave = vi.fn(async () => {})
    rerender({ handleSave: secondSave })

    await act(async () => {
      const ok = await result.current.runCommand('save')
      expect(ok).toBe(true)
    })
    expect(firstSave).not.toHaveBeenCalled()
    expect(secondSave).toHaveBeenCalledOnce()
  })

  it('runCommand 构造 CommandContext：activeFileId / hasWorkspace / hasUnsavedChanges', async () => {
    const getHasUnsavedChanges = vi.fn(() => true)
    const workspacePathRef: MutableRefObject<string | undefined> = { current: undefined }
    const { result } = renderHook(() =>
      useCommandRegistry(makeOptions({ activeFileId: 'doc-9', getHasUnsavedChanges, workspacePathRef })),
    )

    // 注册一个探针命令来断言上下文
    result.current.commandRegistry!.register({
      id: 'probe',
      title: 'probe',
      enabled: () => true,
      execute: (ctx) => {
        expect(ctx.activeFileId).toBe('doc-9')
        expect(ctx.hasWorkspace).toBe(false)
        expect(ctx.hasUnsavedChanges).toBe(true)
      },
    })

    await act(async () => {
      await result.current.runCommand('probe')
    })
    expect(getHasUnsavedChanges).toHaveBeenCalled()
  })

  it('未注册的命令 runCommand 返回 false', async () => {
    const { result } = renderHook(() => useCommandRegistry(makeOptions()))
    await act(async () => {
      const ok = await result.current.runCommand('does-not-exist')
      expect(ok).toBe(false)
    })
  })

  it('extraCommands 在首次渲染时追加注册', () => {
    const extra = {
      id: 'custom.hello',
      title: 'Hello',
      enabled: () => true,
      execute: vi.fn(),
    }
    const { result } = renderHook(() => useCommandRegistry(makeOptions({ extraCommands: [extra] })))
    expect(result.current.commandRegistry!.get('custom.hello')).toBeDefined()
  })

  it('布局预设命令：应用后设置侧栏视图、宽度与打字机模式', async () => {
    const setSidebarActiveTab = vi.fn()
    const setSidebarWidth = vi.fn()
    const setTypewriter = vi.fn()
    const setContextDockState = vi.fn()
    const getLayoutState = vi.fn(
      (): AppliedLayoutState => ({ activeView: 'files', sidebarWidth: 260, typewriterMode: false }),
    )
    const { result } = renderHook(() =>
      useCommandRegistry(
        makeOptions({
          setSidebarActiveTab,
          setSidebarWidth,
          setTypewriter,
          setContextDockState,
          getLayoutState,
        }),
      ),
    )

    const preset = BUILT_IN_LAYOUT_PRESETS[0]
    await act(async () => {
      await result.current.runCommand(`layout.preset.${preset.id}`)
    })

    expect(setSidebarActiveTab).toHaveBeenCalledWith('files')
    expect(setSidebarWidth).toHaveBeenCalled()
    expect(setTypewriter).toHaveBeenCalled()
  })

  it('首次渲染注册全部应用层动作命令（菜单/快捷键/命令面板同源）', () => {
    const { result } = renderHook(() => useCommandRegistry(makeOptions()))
    const registry = result.current.commandRegistry!
    const expected = [
      'new', 'newWindow', 'open', 'openFolder', 'saveAs',
      'closeTab', 'closeOtherTabs', 'closeAllTabs',
      'images', 'publish', 'exportPdf', 'exportHtml', 'exportMarkdown', 'exportDocx', 'exportPandoc',
      'newTemplate:readme', 'newTemplate:api', 'newTemplate:design', 'newTemplate:changelog',
      'newTemplate:article', 'newTemplate:decision',
      'find', 'replace', 'wsSearch', 'commandPalette',
      'toggleSidebar', 'toggleFocus', 'togglePreview', 'zoomIn', 'zoomOut', 'zoomReset', 'typewriter',
      'outline', 'linksPanel', 'tagsPanel', 'propertiesPanel', 'qualityPanel', 'graph', 'versionHistory',
      'shortcuts', 'markdown', 'about', 'stats', 'settings',
    ]
    for (const id of expected) {
      expect(registry.get(id), `命令 ${id} 应已注册`).toBeDefined()
    }
    // 快捷键侧别名不单独注册，由分发入口归一
    expect(registry.get('preview')).toBeUndefined()
    expect(registry.get('focusMode')).toBeUndefined()
  })

  it('应用层动作命令经 handlersRef 读取最新处理器', async () => {
    const firstFind = vi.fn()
    const { result, rerender } = renderHook(
      ({ setSearchMode }: { setSearchMode: ActionHandlers['setSearchMode'] }) =>
        useCommandRegistry(makeOptions({ actionHandlers: makeActionHandlers({ setSearchMode }) })),
      { initialProps: { setSearchMode: firstFind } },
    )

    const secondFind = vi.fn()
    rerender({ setSearchMode: secondFind })

    await act(async () => {
      const ok = await result.current.runCommand('find')
      expect(ok).toBe(true)
    })
    expect(firstFind).not.toHaveBeenCalled()
    expect(secondFind).toHaveBeenCalledWith('find')
  })

  it('原生对话框命令带 settle 焦点策略，弹窗命令带 never', () => {
    const { result } = renderHook(() => useCommandRegistry(makeOptions()))
    const registry = result.current.commandRegistry!
    expect(registry.get('open')?.focusEditor).toBe('settle')
    expect(registry.get('saveAs')?.focusEditor).toBe('settle')
    expect(registry.get('exportHtml')?.focusEditor).toBe('settle')
    expect(registry.get('find')?.focusEditor).toBe('never')
    expect(registry.get('settings')?.focusEditor).toBe('never')
    expect(registry.get('new')?.focusEditor).toBeUndefined()
  })

  it('文档 scope 命令在无活动文档时不可执行', async () => {
    const handleSaveAs = vi.fn(async () => {})
    const { result } = renderHook(() =>
      useCommandRegistry(makeOptions({
        activeFileId: '',
        actionHandlers: makeActionHandlers({ handleSaveAs }),
      })),
    )
    await act(async () => {
      const ok = await result.current.runCommand('saveAs')
      expect(ok).toBe(false)
    })
    expect(handleSaveAs).not.toHaveBeenCalled()
  })
})
