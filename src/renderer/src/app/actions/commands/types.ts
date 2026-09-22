import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ContextDockPanel } from '../../../components/ContextDock/context-dock-state'
import type { HelpView } from '../../../components/HelpDialog'
import type { DocumentTemplate } from '../../../lib/document-collection'

/**
 * 应用层动作处理器集合：菜单、右键菜单、快捷键和命令面板共享的命令实现
 * 所需要的全部会话/视图/弹窗动作。
 *
 * useCommandRegistry 只在首次渲染时注册命令，之后通过 MutableRefObject
 * 读取最新处理器引用（与 saveImplRef 同一模式），避免陈旧闭包。
 */
export interface ActionHandlers {
  /* 会话动作 */
  handleNew: () => void
  handleOpen: () => Promise<void>
  handleOpenFolder: () => Promise<void>
  handleSaveAs: () => Promise<void>
  handleCloseTab: (id: string) => Promise<void>
  handleCloseOtherTabs: (id: string) => void
  handleCloseAllTabs: () => void
  /** 从开发者模板创建新文档并打开（命令面板动作） */
  handleNewFromTemplate?: (template: DocumentTemplate) => void
  /* 导出 */
  handleExportHtml: () => Promise<void>
  handleExportMarkdown: () => Promise<void>
  handleExportPandoc: () => Promise<void>
  handleExportDocx: () => Promise<void>
  setPdfOptsOpen: Dispatch<SetStateAction<boolean>>
  /* 面板与视图 */
  openOutlinePanel: () => void
  openContextPanel: (panel: ContextDockPanel) => void
  handleOpenVersionHistory: () => void
  openGraphView: () => void
  setSearchMode: (mode: 'find' | 'replace' | 'none') => void
  setImagesOpen: Dispatch<SetStateAction<boolean>>
  setPublishOpen: Dispatch<SetStateAction<boolean>>
  setWsSearchOpen: Dispatch<SetStateAction<boolean>>
  setPaletteOpen: Dispatch<SetStateAction<boolean>>
  setSettingsOpen: Dispatch<SetStateAction<boolean>>
  setSupportSummaryOpen: Dispatch<SetStateAction<boolean>>
  setHelpView: Dispatch<SetStateAction<HelpView>>
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  setFocusMode: Dispatch<SetStateAction<boolean>>
  setPreviewMode: Dispatch<SetStateAction<boolean>>
  setTypewriter: Dispatch<SetStateAction<boolean>>
  setZoom: Dispatch<SetStateAction<number>>
  /* 上下文探针 */
  setToast: (message: string) => void
  centerCaret: () => void
  activeFileIdRef: MutableRefObject<string>
  workspacePathRef: MutableRefObject<string | undefined>
}

export type ActionHandlersRef = MutableRefObject<ActionHandlers>
