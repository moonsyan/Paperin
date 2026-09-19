import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { EditorHandle } from '../../components/Editor'
import type { ContextDockState } from '../../components/ContextDock/context-dock-state'
import type { HelpView } from '../../components/HelpDialog'
import type { SidebarView } from '../../../../shared/workspace-state'
import type { AppliedLayoutState } from '../workspace/layout-preset'
import type { DocumentTemplate } from '../../lib/document-collection'

/**
 * useAppActions 入口参数。集中定义在 actions 子目录，方便各拆分模块按需要
 * 只 pick 自己关心的字段，避免把整包 options 传下去导致耦合。
 */
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
  handleNewFromTemplate?: (template: DocumentTemplate) => void
  setWsSearchOpen: Dispatch<SetStateAction<boolean>>
  setPaletteOpen: Dispatch<SetStateAction<boolean>>
  setVersionHistoryOpen: Dispatch<SetStateAction<boolean>>
  /** 打开图谱（含工作区校验与链接刷新，策略在 useGraphView） */
  openGraphView: () => void
  /** 会话脏状态探针（可选）：命令注册表 enabled 判断使用；Task 7 会话迁移后接入真实脏状态 */
  getHasUnsavedChanges?: () => boolean
  /** 当前布局状态快照（布局预设应用时作为保持字段的现状来源） */
  getLayoutState: () => AppliedLayoutState
  setSidebarWidth: Dispatch<SetStateAction<number>>
}
