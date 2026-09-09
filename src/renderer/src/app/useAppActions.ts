import { useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { EditorHandle } from '../components/Editor'
import type { ContextDockPanel, ContextDockState } from '../components/ContextDock/context-dock-state'
import type { HelpView } from '../components/HelpDialog'
import type { SidebarView } from '../../../shared/workspace-state'
import { isImeComposing } from '../lib/keyboard'
import { resolveEditorAction } from './editorActions'
import type { CommandContext } from './commands/app-command'
import type { AppCommandRegistry } from './commands/app-command-registry'
import { createAppCommandRegistry } from './commands/app-command-registry'
import { applyLayoutPreset, BUILT_IN_LAYOUT_PRESETS } from './workspace/layout-preset'
import type { AppliedLayoutState } from './workspace/layout-preset'

export interface UseAppActionsOptions {
  editorRef: RefObject<EditorHandle>
  /** 文档标题（标题栏 contentEditable 的回显与 Esc 还原） */
  docTitle: string
  setDocTitle: Dispatch<SetStateAction<string>>
  activeFileId: string
  activeFileIdRef: MutableRefObject<string>
  openFiles: Array<{ id: string; name: string; path?: string; preview?: boolean }>
  openFilesRef: MutableRefObject<Array<{ id: string; name: string; path?: string; preview?: boolean }>>
  setOpenFiles: Dispatch<SetStateAction<Array<{ id: string; name: string; path?: string; preview?: boolean }>>>
  /** 演示文档 id → 名称（演示文档禁止重命名） */
  demoFileNames: Record<string, string>
  /** 当前活动文档的磁盘路径；未命名文档为 undefined */
  activeFilePath: string | undefined
  workspacePathRef: MutableRefObject<string | undefined>
  focusEditorSoon: () => void
  setToast: (message: string) => void
  /* 会话动作 */
  handleNew: () => void
  handleOpen: () => Promise<void>
  handleOpenFolder: () => Promise<void>
  handleSelectWorkspaceFile: (path: string, pinned?: boolean) => Promise<boolean>
  handleSave: () => Promise<void>
  handleSaveAs: () => Promise<void>
  handleCloseTab: (id: string) => Promise<void>
  handleCloseOtherTabs: (id: string) => void
  handleCloseAllTabs: () => void
  /** 返回是否重命名成功（false = 已提示冲突/失败），由 WorkspaceController 提供 */
  handleRenameFile: (path: string, newName: string) => Promise<boolean>
  /* 导出 */
  handleExportHtml: () => Promise<void>
  handleExportMarkdown: () => Promise<void>
  handleExportPandoc: () => Promise<void>
  handleExportDocx: () => Promise<void>
  /* 视图与弹窗状态 */
  setSearchMode: (mode: 'find' | 'replace' | 'none') => void
  setFocusOutlineTick: Dispatch<SetStateAction<number>>
  setSidebarActiveTab: Dispatch<SetStateAction<SidebarView>>
  setContextDockState: Dispatch<SetStateAction<ContextDockState>>
  setSearchPref: Dispatch<
    SetStateAction<{
      query: string
      useRegex: boolean
      caseSensitive: boolean
      wholeWord: boolean
      replacement: string
    }>
  >
  setSearchEpoch: Dispatch<SetStateAction<number>>
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  setFocusMode: Dispatch<SetStateAction<boolean>>
  setPreviewMode: Dispatch<SetStateAction<boolean>>
  setTypewriter: Dispatch<SetStateAction<boolean>>
  setZoom: Dispatch<SetStateAction<number>>
  centerCaret: () => void
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  setHelpView: Dispatch<SetStateAction<HelpView>>
  setImagesOpen: Dispatch<SetStateAction<boolean>>
  setPdfOptsOpen: Dispatch<SetStateAction<boolean>>
  setPublishOpen: Dispatch<SetStateAction<boolean>>
  /** 从开发者模板创建新文档并打开（命令面板动作） */
  handleNewFromTemplate?: (template: 'readme' | 'api' | 'design' | 'changelog') => void
  setWsSearchOpen: Dispatch<SetStateAction<boolean>>
  setPaletteOpen: Dispatch<SetStateAction<boolean>>
  setVersionHistoryOpen: Dispatch<SetStateAction<boolean>>
  setGraphTabOpen: Dispatch<SetStateAction<boolean>>
  setGraphTabActive: Dispatch<SetStateAction<boolean>>
  refreshLinks: () => void
  /** 会话脏状态探针（可选）：命令注册表 enabled 判断使用；Task 7 会话迁移后接入真实脏状态 */
  getHasUnsavedChanges?: () => boolean
  /** 当前布局状态快照（布局预设应用时作为保持字段的现状来源） */
  getLayoutState: () => AppliedLayoutState
  setSidebarWidth: Dispatch<SetStateAction<number>>
}

/** 应用层动作集合：菜单/命令面板/快捷键共用的事件分发（handleAction）、
 *  弹窗关闭器、文档标题编辑、反链跳转等顶层交互动作。
 *  从 App.tsx 抽出，App 只负责装配与渲染。全部返回值引用稳定。 */
export function useAppActions({
  editorRef,
  docTitle,
  setDocTitle,
  activeFileId,
  activeFileIdRef,
  openFiles,
  openFilesRef,
  setOpenFiles,
  demoFileNames,
  activeFilePath,
  workspacePathRef,
  focusEditorSoon,
  setToast,
  handleNew,
  handleOpen,
  handleOpenFolder,
  handleSelectWorkspaceFile,
  handleSave,
  handleSaveAs,
  handleCloseTab,
  handleCloseOtherTabs,
  handleCloseAllTabs,
  handleRenameFile,
  handleExportHtml,
  handleExportMarkdown,
  handleExportPandoc,
  handleExportDocx,
  setSearchMode,
  setFocusOutlineTick,
  setSidebarActiveTab,
  setContextDockState,
  setSearchPref,
  setSearchEpoch,
  setSidebarCollapsed,
  setFocusMode,
  setPreviewMode,
  setTypewriter,
  setZoom,
  centerCaret,
  setSettingsOpen,
  setHelpView,
  setImagesOpen,
  setPdfOptsOpen,
  setPublishOpen,
  handleNewFromTemplate,
  setWsSearchOpen,
  setPaletteOpen,
  setVersionHistoryOpen,
  setGraphTabOpen,
  setGraphTabActive,
  refreshLinks,
  getHasUnsavedChanges,
  getLayoutState,
  setSidebarWidth,
}: UseAppActionsOptions) {
  /* ==================== 命令注册表（菜单 / 快捷键 / 命令面板共享执行） ==================== */

  const commandRegistryRef = useRef<AppCommandRegistry | null>(null)
  if (!commandRegistryRef.current) {
    commandRegistryRef.current = createAppCommandRegistry()
  }
  // 经 ref 转发最新会话动作：注册只发生一次（重复注册在开发期抛错），
  // 而 handleSave 等 useCallback 依赖变化后引用会更新
  const saveImplRef = useRef(handleSave)
  saveImplRef.current = handleSave
  // StrictMode 双渲染会二次执行渲染体：save 注册必须只发生一次，
  // 否则第二次渲染重复注册在开发期抛错、整树被错误边界卸载
  const saveCommandRegisteredRef = useRef(false)
  if (!saveCommandRegisteredRef.current) {
    saveCommandRegisteredRef.current = true
    commandRegistryRef.current.register({
      id: 'save',
      title: '保存',
      shortcut: 'Ctrl+S',
      enabled: () => true,
      execute: () => {
        void saveImplRef.current()
      },
    })
  }

  /* 布局预设命令（Task 7A）：layout.preset.* 只改视图/宽度/开关，
     不触碰标签列表与文档内容。经 ref 读最新布局，注册只发生一次 */
  const layoutStateRef = useRef(getLayoutState)
  layoutStateRef.current = getLayoutState
  const typewriterSetterRef = useRef(setTypewriter)
  typewriterSetterRef.current = setTypewriter
  const presetCommandsRegisteredRef = useRef(false)
  if (!presetCommandsRegisteredRef.current) {
    presetCommandsRegisteredRef.current = true
    for (const preset of BUILT_IN_LAYOUT_PRESETS) {
      commandRegistryRef.current.register({
        id: `layout.preset.${preset.id}`,
        title: `布局：${preset.name}`,
        enabled: () => true,
        execute: () => {
          const next = applyLayoutPreset(preset, layoutStateRef.current())
          setSidebarActiveTab('files')
          if (next.activeView !== 'files') {
            setContextDockState((current) => ({ ...current, panel: next.activeView as ContextDockPanel, visibility: 'expanded' }))
          }
          setSidebarWidth(next.sidebarWidth)
          typewriterSetterRef.current(next.typewriterMode)
          if (next.typewriterMode) setTimeout(centerCaret, 0)
        },
      })
    }
  }

  const handleDocumentTitleBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      const currentFile = openFiles.find((file) => file.id === activeFileId)
      const previousName = currentFile?.name ?? docTitle
      const nextName = (event.currentTarget.textContent ?? '').trim()
      // contentEditable 不会自动受 React 控制；先还原显示，等待真实重命名成功后再更新状态。
      event.currentTarget.textContent = previousName
      if (!nextName) {
        setToast('文件名不能为空')
        return
      }
      if (nextName === previousName) return
      if (currentFile?.path) {
        void handleRenameFile(currentFile.path, nextName)
        return
      }
      if (currentFile && demoFileNames[currentFile.id]) {
        // 演示文档名由模板固定：改名只改内存、重载即还原，还会与侧栏模板名不一致
        setToast('演示文档不支持重命名')
        return
      }
      setDocTitle(nextName)
      const renamedFiles = openFilesRef.current.map((file) =>
        file.id === activeFileId ? { ...file, name: nextName } : file,
      )
      openFilesRef.current = renamedFiles
      setOpenFiles(renamedFiles)
    },
    [activeFileId, demoFileNames, docTitle, handleRenameFile, openFiles, openFilesRef, setOpenFiles, setDocTitle, setToast],
  )

  const handleDocumentTitleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isImeComposing(event.nativeEvent)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        event.currentTarget.blur()
        return
      }
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.currentTarget.textContent = docTitle
      event.currentTarget.blur()
    },
    [docTitle],
  )

  // 打开反链/出链指向的文件并接力文档内搜索定位（与工作区搜索结果点选同一模式）
  const backlinkSelectSeqRef = useRef(0)
  const handleOpenBacklink = useCallback(
    (path: string, query: string) => {
      const seq = ++backlinkSelectSeqRef.current
      void (async () => {
        const ok = await handleSelectWorkspaceFile(path)
        if (seq !== backlinkSelectSeqRef.current || !ok) return
        if (query) {
          setSearchPref((prev) => ({ ...prev, query, useRegex: false }))
          setSearchEpoch((e) => e + 1)
          setSearchMode('find')
        }
      })()
    },
    [handleSelectWorkspaceFile, setSearchEpoch, setSearchMode, setSearchPref],
  )

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setSettingsOpen])

  const closeHelp = useCallback(() => {
    setHelpView(null)
    focusEditorSoon()
  }, [focusEditorSoon, setHelpView])

  const closeImages = useCallback(() => {
    setImagesOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setImagesOpen])

  const closePdfOptions = useCallback(() => {
    setPdfOptsOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setPdfOptsOpen])

  const closePublish = useCallback(() => {
    setPublishOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setPublishOpen])

  const closeWorkspaceSearch = useCallback(() => {
    setWsSearchOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setWsSearchOpen])

  const closePalette = useCallback(() => {
    setPaletteOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setPaletteOpen])

  const closeVersionHistory = useCallback(() => {
    setVersionHistoryOpen(false)
    focusEditorSoon()
  }, [focusEditorSoon, setVersionHistoryOpen])

  /** 打开版本历史：仅磁盘文件有快照记录 */
  const handleOpenVersionHistory = useCallback(() => {
    if (!activeFilePath) {
      setToast('当前文档尚未保存到磁盘，暂无版本历史')
      return
    }
    setVersionHistoryOpen(true)
  }, [activeFilePath, setToast, setVersionHistoryOpen])

  /** 导出 PDF：先弹选项窗（纸张/页边距/页眉页脚） */
  const handleExportPdf = useCallback(() => {
    setPdfOptsOpen(true)
  }, [setPdfOptsOpen])

  /** 统一命令执行入口：菜单、快捷键和命令面板最终都落到这里 */
  const runCommand = useCallback(
    (id: string): Promise<boolean> => {
      const registry = commandRegistryRef.current
      if (!registry) return Promise.resolve(false)
      const context: CommandContext = {
        activeFileId,
        hasWorkspace: Boolean(workspacePathRef.current),
        hasUnsavedChanges: getHasUnsavedChanges?.() ?? false,
      }
      return registry.execute(id, context)
    },
    [activeFileId, getHasUnsavedChanges, workspacePathRef],
  )

  /** 大纲面板：确保侧栏展开后延迟一拍触发定位 tick（M5 时序约束） */
  const openOutlinePanel = useCallback(() => {
    setSidebarCollapsed(false)
    setContextDockState((current) => ({ ...current, panel: 'outline', visibility: 'expanded' }))
    // M5：侧栏折叠时组件重新挂载，挂载时 lastOutlineTickRef 初始化为当前 tick，
    // 同一批渲染内递增的 tick 会被新实例当作"已消费"，Tab 永远切不过去。
    // 延迟一拍再递增，保证展开后的新实例能消费到这次切换
    setTimeout(() => setFocusOutlineTick((t) => t + 1), 0)
  }, [setContextDockState, setFocusOutlineTick, setSidebarCollapsed])

  const openContextPanel = useCallback((panel: ContextDockPanel) => {
    setContextDockState((current) => ({ ...current, panel, visibility: 'expanded' }))
  }, [setContextDockState])

  /** 打开知识图谱视图 = 用户主动场景：绕过自动扫描限流，确保展示最新链接 */
  const handleOpenGraphView = useCallback(() => {
    if (!workspacePathRef.current) {
      setToast('请先打开文件夹（工作区）后再查看知识图谱')
      return
    }
    refreshLinks()
    setGraphTabOpen(true)
    setGraphTabActive(true)
  }, [refreshLinks, setGraphTabActive, setGraphTabOpen, setToast, workspacePathRef])

  const handleAction = useCallback(
    (action: string) => {
      const ed = editorRef.current
      const shouldFocusEditor = ![
        'find',
        'replace',
        'wsSearch',
        'images',
        'exportPdf',
        'shortcuts',
        'markdown',
        'about',
        'stats',
        'settings',
        'publish',
        'versionHistory',
      ].includes(action)
      // 注册表已登记的命令（save、layout.preset.* 等）统一优先走注册表，
      // 与快捷键/命令面板共享同一 execute；未登记的动作保留原 switch 分发
      const registeredCommand = commandRegistryRef.current?.get(action)
      if (registeredCommand) {
        void runCommand(action)
        // 命令不经对话框收尾逻辑，仅补普通路径的编辑器聚焦（与原 case 行为一致）
        if (shouldFocusEditor) ed?.focus()
        return
      }
      // 编辑器命令类动作（撤销/格式/段落/表格等）统一走共享命令表，
      // 与全局快捷键分发同源；其余应用层动作用 switch 处理
      const editorAction = resolveEditorAction(action)
      if (editorAction) {
        editorAction(ed)
      } else {
        switch (action) {
          // 文件
          case 'new': handleNew(); break
          case 'newWindow': void window.desktopAPI?.window.newWindow(); break
          // open/openFolder/saveAs/exportHtml/exportMarkdown/exportPandoc
          // 打开原生对话框：不在此同步分发，统一在 L20 异步块处理
          case 'images': setImagesOpen(true); break
          // 保存已迁移至命令注册表：菜单 / 快捷键 / 命令面板共享同一 execute
          case 'save': void runCommand('save'); break
          case 'closeTab': handleCloseTab(activeFileId); break
          case 'closeOtherTabs': handleCloseOtherTabs(activeFileIdRef.current); break
          case 'closeAllTabs': handleCloseAllTabs(); break
          case 'exportPdf': handleExportPdf(); break
          case 'publish': setPublishOpen(true); break
          case 'newTemplate:readme':
          case 'newTemplate:api':
          case 'newTemplate:design':
          case 'newTemplate:changelog':
            handleNewFromTemplate?.(action.slice('newTemplate:'.length) as 'readme' | 'api' | 'design' | 'changelog')
            break
          case 'find': setSearchMode('find'); break
          case 'replace': setSearchMode('replace'); break
          case 'wsSearch':
            // 用 ref 镜像而非 workspace 状态：handleAction 依赖数组不含 workspace，
            // 直接读状态会因陈旧闭包导致打开文件夹后菜单仍提示未打开
            if (workspacePathRef.current) setWsSearchOpen(true)
            else setToast('请先打开文件夹（工作区）后再使用全文搜索')
            break
          case 'commandPalette':
            setPaletteOpen(true)
            break
          case 'versionHistory':
            handleOpenVersionHistory()
            break
          // 视图
          case 'toggleSidebar': setSidebarCollapsed((v) => !v); break
          case 'toggleFocus': setFocusMode((v) => !v); break
          case 'togglePreview': setPreviewMode((v) => !v); break
          case 'zoomIn': setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2))); break
          case 'zoomOut': setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2))); break
          case 'zoomReset': setZoom(1); break
          case 'typewriter':
            setTypewriter((v) => {
              const next = !v
              if (next) setTimeout(centerCaret, 0)
              return next
            })
            break
          case 'outline':
            openOutlinePanel()
            break
          case 'linksPanel':
            openContextPanel('links')
            break
          case 'tagsPanel':
            openContextPanel('tags')
            break
          case 'propertiesPanel':
            openContextPanel('properties')
            break
          case 'qualityPanel':
            openContextPanel('quality')
            break
          case 'graph':
            handleOpenGraphView()
            break
          // 帮助
          case 'shortcuts': setHelpView('shortcuts'); break
          case 'markdown': setHelpView('syntax'); break
          case 'about': setHelpView('about'); break
          case 'stats': setHelpView('stats'); break
          case 'settings': setSettingsOpen(true); break
          default:
            if (action.startsWith('openRecent:')) {
              const p = action.slice('openRecent:'.length)
              void handleSelectWorkspaceFile(p)
            }
            break
        }
      }
      // L20：打开原生对话框的动作不能在对话框打开前同步 focus——
      // 焦点先被菜单按钮拿走，同步 focus 又被对话框打断，取消后
      // 焦点落在窗口 chrome 上。改为等 promise 结束（对话框关闭）
      // 再聚焦：成功路径自身会聚焦编辑器，这里补取消对话框的路径。
      if (shouldFocusEditor) {
        if (
          action === 'open' ||
          action === 'openFolder' ||
          action === 'saveAs' ||
          action === 'exportHtml' ||
          action === 'exportMarkdown' ||
          action === 'exportDocx' ||
          action === 'exportPandoc'
        ) {
          void (async () => {
            switch (action) {
              case 'open': await handleOpen(); break
              case 'openFolder': await handleOpenFolder(); break
              case 'saveAs': await handleSaveAs(); break
              case 'exportHtml': await handleExportHtml(); break
              case 'exportMarkdown': await handleExportMarkdown(); break
              case 'exportDocx': await handleExportDocx(); break
              case 'exportPandoc': await handleExportPandoc(); break
              default: break
            }
            ed?.focus()
          })()
        } else {
          ed?.focus()
        }
      }
    },
    [
      activeFileId,
      activeFileIdRef,
      centerCaret,
      handleCloseAllTabs,
      handleCloseOtherTabs,
      handleCloseTab,
      handleExportDocx,
      handleExportHtml,
      handleExportMarkdown,
      handleExportPdf,
      handleExportPandoc,
      handleNew,
      handleNewFromTemplate,
      handleOpen,
      handleOpenFolder,
      handleOpenGraphView,
      handleOpenVersionHistory,
      handleSaveAs,
      handleSelectWorkspaceFile,
      openOutlinePanel,
      openContextPanel,
      runCommand,
      setFocusMode,
      setHelpView,
      setImagesOpen,
      setPaletteOpen,
      setPreviewMode,
      setPublishOpen,
      setSearchMode,
      setSettingsOpen,
      setSidebarCollapsed,
      setTypewriter,
      setWsSearchOpen,
      setZoom,
      workspacePathRef,
      editorRef,
      setToast,
    ],
  )

  return {
    handleAction,
    runCommand,
    commandRegistry: commandRegistryRef.current,
    handleDocumentTitleBlur,
    handleDocumentTitleKeyDown,
    handleOpenBacklink,
    handleOpenGraphView,
    closeSettings,
    closeHelp,
    closeImages,
    closePdfOptions,
    closePublish,
    closeWorkspaceSearch,
    closePalette,
    closeVersionHistory,
    handleExportPdf,
    openOutlinePanel,
  }
}
