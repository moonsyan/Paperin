import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type {
  ContextDockState,
  SidebarView,
  WorkspaceDocumentsState,
  WorkspaceSettingsState,
} from '../../../../shared/workspace-state'
import type { EditorHandle } from '../../components/Editor'
import type { WorkspaceInfo } from '../../components/Sidebar'
import type { SetSearchMode } from '../useEditorSearch'

export interface AutoSaveSnapshot {
  path: string
  name: string
  content: string
}

export interface DocumentSessionOptions {
  editorRef: RefObject<EditorHandle>
  titleRef: RefObject<HTMLDivElement>
  settingsReady: boolean
  autosave: boolean
  setToast: Dispatch<SetStateAction<string>>
  recordRecent: (path: string, name: string) => void
  workspacePathRef: MutableRefObject<string | undefined>
  workspaceDocumentsRef: MutableRefObject<WorkspaceDocumentsState>
  setWorkspace: Dispatch<SetStateAction<WorkspaceInfo | null>>
  setWorkspaceStateReady: Dispatch<SetStateAction<boolean>>
  setWorkspaceSettings: Dispatch<SetStateAction<WorkspaceSettingsState>>
  setWorkspaceDocuments: Dispatch<SetStateAction<WorkspaceDocumentsState>>
  setWorkspaceCollapsedKeys: Dispatch<SetStateAction<string[] | null>>
  setSidebarWidth: Dispatch<SetStateAction<number>>
  setSidebarActiveTab: Dispatch<SetStateAction<SidebarView>>
  setContextDockState: Dispatch<SetStateAction<ContextDockState>>
  setSearchCount: Dispatch<SetStateAction<number>>
  setSearchCurrent: Dispatch<SetStateAction<number>>
  setSearchMode: SetSearchMode
  /** 可选闸门：会话恢复路径打开工作区前置 false，通知图谱 auto-open 不激活
   *  （useGraphView 消费一次后自动复位 true）。见 useGraphView.autoOpenActivateRef。 */
  restoringWorkspaceRef?: MutableRefObject<boolean>
  /** 启动加载后由 useAppSettings 写入本窗口草稿会话 id */
  draftSessionIdRef?: MutableRefObject<string | undefined>
  /** 另存为/首次落盘后通知来源身份迁移 */
  onDocumentPathCommitted?: (info: {
    previousDocumentId: string
    previousPath: string | undefined
    nextPath: string
  }) => void
}
