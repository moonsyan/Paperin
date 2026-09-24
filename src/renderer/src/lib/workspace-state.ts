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
  /** null/undefined = 不写入展开记忆字段；数组（含空）= 写入 */
  expandedDirectories?: string[] | null
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

/**
 * 展开记忆相对路径补全祖先，并按深度升序（便于逐级 listDir）。
 * 例：['docs/api'] → ['docs', 'docs/api']
 */
export const expandRelativePathsWithAncestors = (relativePaths: readonly string[]): string[] => {
  const out = new Set<string>()
  for (const relative of relativePaths) {
    const normalized = normalizeWorkspaceRelativePath(relative)
    if (!normalized) continue
    const parts = normalized.split('/')
    for (let i = 1; i <= parts.length; i += 1) {
      out.add(parts.slice(0, i).join('/'))
    }
  }
  return Array.from(out).sort((left, right) => {
    const depth = left.split('/').length - right.split('/').length
    return depth !== 0 ? depth : left.localeCompare(right)
  })
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
  expandedDirectories,
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
  const expanded = expandedDirectories == null
    ? undefined
    : expandedDirectories.flatMap((path) => {
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
      ...(expanded !== undefined ? { expandedDirectories: expanded } : {}),
    },
    contextDock: contextDock ?? {
      width: 312,
      visibility: 'expanded',
      panel: 'outline',
      compact: false,
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
