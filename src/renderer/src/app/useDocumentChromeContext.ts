import { useCallback, useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { OpenFile, WorkspaceInfo } from '../components/Sidebar'
import type { DocumentPathKind } from '../components/DocumentPathbar'
import { buildSidebarViewModel } from '../components/Sidebar/sidebar-view-model'
import { collectFolderKeys, buildWorkspaceFileTree } from '../components/Sidebar/fileTree'
import { collapsedKeysAfterRevealFromRecord } from '../lib/path-display'
import type { DocumentStorageKind } from '../lib/document-save-status'
import type { WorkspaceIndex } from '../../../shared/workspace-index'
import { classifyDocumentSource } from './document-session/document-source'
import { DEMO_FILE_IDS } from './constants'

interface DocumentChromeContextOptions {
  activeFile: OpenFile | undefined
  activeFileId: string
  workspace: WorkspaceInfo | null
  workspaceIndex: WorkspaceIndex | null
  currentCollapsedKeys: string[] | null
  collapseFoldersOnOpen: boolean
  caseInsensitive: boolean
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  handleCollapsedKeysChange: (keys: string[]) => void
}

export const classifyActivePathKind = (
  file: OpenFile | undefined,
  activeFileId: string,
  workspacePath: string | null | undefined,
  caseInsensitive: boolean,
): DocumentPathKind => {
  if (!file) return 'unnamed'
  if (DEMO_FILE_IDS.has(activeFileId)) return 'demo'
  if (!file.path) return 'unnamed'
  return classifyDocumentSource(file.path, workspacePath, caseInsensitive)
}

/** 顶栏、路径条、资源目录与侧栏定位共用同一个活动文件上下文。 */
export function useDocumentChromeContext({
  activeFile, activeFileId, workspace, workspaceIndex, currentCollapsedKeys,
  collapseFoldersOnOpen, caseInsensitive, setSidebarCollapsed, handleCollapsedKeysChange,
}: DocumentChromeContextOptions) {
  const imageDirs = useMemo(() => {
    const dirs: string[] = []
    if (activeFile?.path) dirs.push(`${activeFile.path.replace(/[\\/][^\\/]+$/, '')}/attachments`)
    if (workspace) dirs.push(`${workspace.path}/attachments`)
    return dirs
  }, [activeFile?.path, workspace])
  const contextDockViewModel = useMemo(
    () => workspaceIndex ? buildSidebarViewModel(workspaceIndex, activeFile?.path ?? null, 'links') : null,
    [activeFile?.path, workspaceIndex],
  )
  const currentFileSource = classifyDocumentSource(activeFile?.path, workspace?.path, caseInsensitive)
  const activePathKind = classifyActivePathKind(activeFile, activeFileId, workspace?.path, caseInsensitive)
  const storageKind: DocumentStorageKind = activePathKind === 'demo' ? 'demo' : activePathKind === 'unnamed' ? 'unnamed' : 'disk'
  const workspaceFolderKeys = useMemo(
    () => workspace ? collectFolderKeys(buildWorkspaceFileTree(workspace.path, workspace.tree)) : [],
    [workspace],
  )
  const revealActiveFileInSidebar = useCallback(() => {
    const path = activeFile?.path
    if (!path || !workspace) return
    setSidebarCollapsed(false)
    const next = collapsedKeysAfterRevealFromRecord(
      currentCollapsedKeys, workspaceFolderKeys, collapseFoldersOnOpen,
      path, workspace.path, caseInsensitive,
    )
    handleCollapsedKeysChange(next)
  }, [activeFile?.path, workspace, currentCollapsedKeys, workspaceFolderKeys,
    collapseFoldersOnOpen, caseInsensitive, setSidebarCollapsed, handleCollapsedKeysChange])

  return { imageDirs, contextDockViewModel, currentFileSource, activePathKind, storageKind, revealActiveFileInSidebar }
}
