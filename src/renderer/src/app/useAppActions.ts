import type { UseAppActionsOptions } from './actions/types'
import { useCommandRegistry } from './actions/useCommandRegistry'
import { useDocumentTitleEditing } from './actions/useDocumentTitleEditing'
import { useDialogClosers } from './actions/useDialogClosers'
import { usePanelNavigation } from './actions/usePanelNavigation'
import { useActionDispatcher } from './actions/useActionDispatcher'

export type { UseAppActionsOptions } from './actions/types'

/**
 * 应用层动作集合入口：菜单/命令面板/快捷键共用的事件分发（handleAction）、
 * 弹窗关闭器、文档标题编辑、反链跳转等顶层交互动作。
 *
 * 只负责装配：命令注册表、动作分发、面板导航、标题编辑和弹窗关闭各自成域。
 * 从 App.tsx 抽出，App 只负责装配与渲染。全部返回值引用稳定。
 *
 * 目录结构：
 * - actions/types.ts：入口参数
 * - actions/useCommandRegistry.ts：命令注册表 + runCommand（save、layout.preset.*）
 * - actions/useDocumentTitleEditing.ts：顶栏标题 blur / keydown
 * - actions/useDialogClosers.ts：8 个弹窗关闭器
 * - actions/usePanelNavigation.ts：ContextDock 面板、反链、版本历史
 * - actions/useActionDispatcher.ts：handleAction switch/case + 原生对话框动作的 L20 聚焦补偿
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

  const { commandRegistry, runCommand } = useCommandRegistry({
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

  const {
    openOutlinePanel,
    openContextPanel,
    handleOpenBacklink,
    handleOpenVersionHistory,
  } = usePanelNavigation({
    setSidebarCollapsed,
    setContextDockState,
    setFocusOutlineTick,
    setSearchMode,
    setSearchPref,
    setSearchEpoch,
    handleSelectWorkspaceFile,
    activeFilePath,
    setVersionHistoryOpen,
    setToast,
  })

  const { handleAction, handleExportPdf } = useActionDispatcher({
    editorRef,
    commandRegistry,
    runCommand,
    activeFileId,
    activeFileIdRef,
    workspacePathRef,
    setToast,
    centerCaret,
    handleNew,
    handleOpen,
    handleOpenFolder,
    handleSaveAs,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    handleSelectWorkspaceFile,
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
    setHelpView,
    setSidebarCollapsed,
    setFocusMode,
    setPreviewMode,
    setTypewriter,
    setZoom,
  })

  return {
    handleAction,
    runCommand,
    commandRegistry,
    handleDocumentTitleBlur,
    handleDocumentTitleKeyDown,
    handleOpenBacklink,
    handleOpenGraphView: openGraphView,
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
