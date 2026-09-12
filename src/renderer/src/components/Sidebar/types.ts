import type { DemoFolder } from '../../data/demo-files'
import type { FolderTreeNode } from '../../../../preload/api'
import type { PanelRegistry } from '../../app/panels/panel-registry'

export interface OpenFile {
  id: string
  name: string
  path?: string
  preview?: boolean
  pinned?: boolean
}

export interface WorkspaceInfo {
  path: string
  name: string
  tree: FolderTreeNode[]
}

export interface SidebarProps {
  demoTree: DemoFolder[]
  demoFileNames: Record<string, string>
  workspace: WorkspaceInfo | null
  openFiles: OpenFile[]
  activeFileId: string
  onSelectDemoFile: (id: string, pinned: boolean) => void
  onSelectWorkspaceFile: (path: string, pinned: boolean) => void
  onCreateFile?: (dirPath: string) => void
  onRenameFile?: (path: string, newName: string) => void
  onDeleteFile?: (path: string) => void
  onMoveFile?: (path: string, targetDir: string) => void
  onOpenInNewWindow?: (path: string) => void
  initialCollapsedKeys?: string[] | null
  onCollapsedKeysChange?: (keys: string[]) => void
  collapseFoldersOnOpen?: boolean
  tagFilter?: { tag: string; paths: string[] } | null
  onClearTagFilter?: () => void
  collapsed?: boolean
  /** sidebar.primary 插槽的面板注册表；缺省消费应用级共享注册表 */
  registry?: PanelRegistry
}
