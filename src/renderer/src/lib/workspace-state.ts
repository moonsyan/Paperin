import type {
  ContextDockState,
  SidebarView,
  WorkspaceDocumentsState,
  WorkspaceDocumentViewState,
  WorkspaceLayoutState,
} from '../../../shared/workspace-state'
import {
  normalizeWorkspaceRelativePath,
  parseWorkspaceDocuments,
} from '../../../shared/workspace-state'
import type { OpenFile } from '../components/Sidebar'

interface WorkspaceLayoutSnapshotOptions {
  rootPath: string
  openFiles: OpenFile[]
  activeFileId: string
  sidebarWidth: number
  sidebarActiveView: SidebarView
  contextDock?: ContextDockState
  collapsedDirectories: string[]
  caseInsensitive: boolean
}

interface WorkspaceDocumentViewOptions {
  state: WorkspaceDocumentsState
  rootPath: string
  filePath: string
  viewState: Omit<WorkspaceDocumentViewState, 'updatedAt'>
  updatedAt: string
  caseInsensitive: boolean
}

const normalizeAbsolutePath = (value: string, caseInsensitive: boolean): string => {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
  return caseInsensitive ? normalized.toLowerCase() : normalized
}

export const toWorkspaceRelativePath = (
  rootPath: string,
  absolutePath: string,
  caseInsensitive: boolean,
): string | null => {
  const root = normalizeAbsolutePath(rootPath, caseInsensitive)
  const candidate = normalizeAbsolutePath(absolutePath, caseInsensitive)
  if (candidate === root || !candidate.startsWith(`${root}/`)) return null
  const originalCandidate = absolutePath.replace(/\\/g, '/').replace(/\/+$/, '')
  const originalRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalizeWorkspaceRelativePath(originalCandidate.slice(originalRoot.length + 1))
}

export const resolveWorkspacePath = (
  rootPath: string,
  relativePath: string,
  platform: string,
): string | null => {
  const normalized = normalizeWorkspaceRelativePath(relativePath)
  if (!normalized) return null
  const separator = platform === 'win32' ? '\\' : '/'
  const root = rootPath.replace(/[\\/]+$/, '')
  return `${root}${separator}${normalized.replace(/\//g, separator)}`
}

export const resolveEffectiveTheme = (
  globalTheme: string,
  workspaceTheme: string,
): string => workspaceTheme === 'inherit' ? globalTheme : workspaceTheme

export const createWorkspaceLayoutSnapshot = ({
  rootPath,
  openFiles,
  activeFileId,
  sidebarWidth,
  sidebarActiveView: _sidebarActiveView,
  contextDock,
  collapsedDirectories,
  caseInsensitive,
}: WorkspaceLayoutSnapshotOptions): WorkspaceLayoutState => {
  const tabs = openFiles.flatMap((file) => {
    if (!file.path) return []
    const path = toWorkspaceRelativePath(rootPath, file.path, caseInsensitive)
    return path ? [{ path, pinned: file.pinned === true }] : []
  })
  const activeFile = openFiles.find((file) => file.id === activeFileId)
  const activeTab = activeFile?.path
    ? toWorkspaceRelativePath(rootPath, activeFile.path, caseInsensitive)
    : null
  const collapsed = collapsedDirectories.flatMap((path) => {
    const relativePath = toWorkspaceRelativePath(rootPath, path, caseInsensitive)
    return relativePath ? [relativePath] : []
  })

  return {
    schemaVersion: 2,
    tabs,
    activeTab: activeTab && tabs.some((tab) => tab.path === activeTab) ? activeTab : null,
    sidebar: {
      width: sidebarWidth,
      activeView: 'files',
      collapsedDirectories: collapsed,
    },
    contextDock: contextDock ?? {
      width: 312,
      visibility: 'expanded',
      panel: 'outline',
    },
  }
}

export const updateWorkspaceDocumentView = ({
  state,
  rootPath,
  filePath,
  viewState,
  updatedAt,
  caseInsensitive,
}: WorkspaceDocumentViewOptions): WorkspaceDocumentsState => {
  const relativePath = toWorkspaceRelativePath(rootPath, filePath, caseInsensitive)
  if (!relativePath) return state
  return parseWorkspaceDocuments({
    schemaVersion: 1,
    documents: {
      ...state.documents,
      [relativePath]: {
        ...viewState,
        updatedAt,
      },
    },
  })
}
