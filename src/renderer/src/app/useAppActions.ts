import type { UseAppActionsOptions } from './actions/types'
import { useCommandRegistry } from './actions/useCommandRegistry'
import { useDocumentTitleEditing } from './actions/useDocumentTitleEditing'
import { useDialogClosers } from './actions/useDialogClosers'
import { usePanelNavigation } from './actions/usePanelNavigation'
import { useActionDispatcher } from './actions/useActionDispatcher'
import { useWorkspaceViewModel } from './workspace/useWorkspaceViewModel'

export type { UseAppActionsOptions } from './actions/types'

/**
 * 应用层动作集合入口：菜单/右键菜单/命令面板/快捷键共用的事件分发（handleAction）、
 * 弹窗关闭器、文档标题编辑、反链跳转等顶层交互动作。
 *
 * 只负责装配：命令注册表、动作分发、面板导航、标题编辑和弹窗关闭各自成域。
 * 从 App.tsx 抽出，App 只负责装配与渲染。全部返回值引用稳定。
 *
 * 目录结构：
 * - actions/types.ts：入口参数
 * - actions/commands/：应用层动作命令工厂（文件/搜索/视图/面板/帮助域）
 * - actions/useCommandRegistry.ts：命令注册表 + runCommand（save、layout.preset.*、全部应用动作）
 * - actions/useDocumentTitleEditing.ts：顶栏标题 blur / keydown
 * - actions/useDialogClosers.ts：8 个弹窗关闭器
 * - actions/usePanelNavigation.ts：ContextDock 面板、反链、版本历史
 * - actions/useActionDispatcher.ts：handleAction 分发骨架（注册表 → 编辑器命令 → 参数化动作）
 * - workspace/useWorkspaceViewModel.ts：打开文件并接力定位的统一往返流程（reveal）
 */
export function useAppActions(options: UseAppActionsOptions) {
  const {
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
    setSupportSummaryOpen,
    setHelpView,
    setImagesOpen,
    setPdfOptsOpen,
    setPublishOpen,
    handleNewFromTemplate,
    setWsSearchOpen,
    setPaletteOpen,
    setVersionHistoryOpen,
    openGraphView,
    getHasUnsavedChanges,
    getLayoutState,
    setSidebarWidth,
  } = options

  // 工作区视图模型：所有"打开文件并接力定位"入口（反链/搜索/图谱/诊断）
  // 共用同一往返流程与并发守卫
  const { reveal } = useWorkspaceViewModel({
    handleSelectWorkspaceFile,
    setSearchMode,
    setSearchPref,
    setSearchEpoch,
    focusEditorLine: (line) => editorRef.current?.focusLine(line),
  })

  const {
    openOutlinePanel,
    openContextPanel,
    handleOpenBacklink,
    handleOpenVersionHistory,
  } = usePanelNavigation({
    setSidebarCollapsed,
    setContextDockState,
    setFocusOutlineTick,
    reveal,
    activeFilePath,
    setVersionHistoryOpen,
    setToast,
  })

  const { commandRegistry, runCommand, isActionAvailable } = useCommandRegistry({
    handleSave,
    getLayoutState,
    setTypewriter,
    setSidebarActiveTab,
    setContextDockState,
    setSidebarWidth,
    centerCaret,
    activeFileId,
    workspacePathRef,
    getHasUnsavedChanges,
    actionHandlers: {
      handleNew,
      handleOpen,
      handleOpenFolder,
      handleSaveAs,
      handleCloseTab,
      handleCloseOtherTabs,
      handleCloseAllTabs,
      handleNewFromTemplate,
      handleExportHtml,
      handleExportMarkdown,
      handleExportPandoc,
      handleExportDocx,
      setPdfOptsOpen,
      openOutlinePanel,
      openContextPanel,
      handleOpenVersionHistory,
      openGraphView,
      setSearchMode,
      setImagesOpen,
      setPublishOpen,
      setWsSearchOpen,
      setPaletteOpen,
      setSettingsOpen,
      setSupportSummaryOpen,
      setHelpView,
      setSidebarCollapsed,
      setFocusMode,
      setPreviewMode,
      setTypewriter,
      setZoom,
      setToast,
      centerCaret,
      activeFileIdRef,
      workspacePathRef,
    },
  })

  const { handleDocumentTitleBlur, handleDocumentTitleKeyDown } = useDocumentTitleEditing({
    docTitle,
    setDocTitle,
    activeFileId,
    openFiles,
    openFilesRef,
    setOpenFiles,
    demoFileNames,
    handleRenameFile,
    setToast,
  })

  const {
    closeSettings,
    closeHelp,
    closeImages,
    closePdfOptions,
    closePublish,
    closeWorkspaceSearch,
    closePalette,
    closeVersionHistory,
  } = useDialogClosers({
    focusEditorSoon,
    setSettingsOpen,
    setHelpView,
    setImagesOpen,
    setPdfOptsOpen,
    setPublishOpen,
    setWsSearchOpen,
    setPaletteOpen,
    setVersionHistoryOpen,
  })

  const { handleAction } = useActionDispatcher({
    editorRef,
    commandRegistry,
    runCommand,
    isActionAvailable,
    handleSelectWorkspaceFile,
    // 快捷键与右键菜单没有灰显可依赖：命令被作用域挡下时给一句原因，而不是静默
    onCommandUnavailable: (hint) => setToast(hint),
  })

  return {
    handleAction,
    runCommand,
    commandRegistry, isActionAvailable,
    handleDocumentTitleBlur,
    handleDocumentTitleKeyDown,
    handleOpenBacklink,
    handleOpenGraphView: openGraphView,
    reveal,
    closeSettings,
    closeHelp,
    closeImages,
    closePdfOptions,
    closePublish,
    closeWorkspaceSearch,
    closePalette,
    closeVersionHistory,
    openOutlinePanel,
  }
}
