import { useEffect } from 'react'
import type { OpenFile, WorkspaceInfo } from '../components/Sidebar'

export interface SessionData {
  activeFileId?: string
  files?: { id: string; name: string; path?: string }[]
  workspacePath?: string
  /** 本窗口草稿会话标识；与 settings.drafts 条目绑定，防止多窗口覆盖。 */
  draftSessionId?: string
}

interface UseDocumentSessionPersistenceOptions {
  activeFileId: string
  demoFileIds: ReadonlySet<string>
  freshMode: boolean
  openFiles: OpenFile[]
  ready: boolean
  workspace: WorkspaceInfo | null
  draftSessionId?: string
}

/** 恢复后仅持久化真实文件标签，避免演示文件和新窗口覆盖主会话。 */
export function useDocumentSessionPersistence({
  activeFileId,
  demoFileIds,
  freshMode,
  openFiles,
  ready,
  workspace,
  draftSessionId,
}: UseDocumentSessionPersistenceOptions): void {
  useEffect(() => {
    if (freshMode || !ready) return
    const seen = new Set<string>()
    const files = openFiles
      .filter((file) => !demoFileIds.has(file.id) && file.id && !seen.has(file.id) && seen.add(file.id))
      .slice(0, 200)
      .map((file) => ({ id: file.id, name: file.name, path: file.path }))
    const data: SessionData = {
      activeFileId: openFiles.some((file) => file.id === activeFileId) ? activeFileId : undefined,
      workspacePath: workspace?.path,
      files,
      draftSessionId,
    }
    window.desktopAPI?.settings.set('session', data).catch(() => {})
  }, [activeFileId, demoFileIds, draftSessionId, freshMode, openFiles, ready, workspace])
}
