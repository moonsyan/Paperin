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
}
