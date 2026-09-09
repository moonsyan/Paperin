import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { SidebarView } from '../../../../shared/workspace-state'
import type { ContextDockState } from '../../../../shared/workspace-state'
import type { OpenFile, WorkspaceInfo } from '../../components/Sidebar'
import { createWorkspaceLayoutSnapshot } from '../../lib/workspace-state'

export interface UseWorkspaceLayoutPersistenceOptions {
  workspace: WorkspaceInfo | null
  /** 工作区状态首次加载完成（加载前不得覆盖主进程已有布局） */
  workspaceStateReady: boolean
  /** 当前树作用域的折叠记录 */
  collapsedKeys: string[] | null
  openFiles: OpenFile[]
  activeFileId: string
  sidebarWidth: number
  sidebarActiveView: SidebarView
  contextDock?: ContextDockState
  setToast: Dispatch<SetStateAction<string>>
}

/** 工作区布局持久化：打开列表/活动标签/侧栏宽度/折叠目录（防抖 500ms）。
 *  布局快照属于工作区域；依赖文档会话的打开列表与活动标签作为输入。 */
export function useWorkspaceLayoutPersistence({
  workspace,
  workspaceStateReady,
  collapsedKeys,
  openFiles,
  activeFileId,
  sidebarWidth,
  sidebarActiveView,
  contextDock,
  setToast,
}: UseWorkspaceLayoutPersistenceOptions): void {
  useEffect(() => {
    if (!workspace || !workspaceStateReady || collapsedKeys == null) return
    const layout = createWorkspaceLayoutSnapshot({
      rootPath: workspace.path,
      openFiles,
      activeFileId,
      sidebarWidth,
      sidebarActiveView,
      contextDock,
      collapsedDirectories: collapsedKeys,
      caseInsensitive: window.desktopAPI?.platform === 'win32',
    })
    const timer = setTimeout(() => {
      window.desktopAPI?.workspaceState.saveLayout(layout).then((result) => {
        if (!result.ok) setToast('工作区布局保存失败')
      }).catch(() => setToast('工作区布局保存失败'))
    }, 500)
    return () => clearTimeout(timer)
  }, [
    activeFileId,
    collapsedKeys,
    openFiles,
    sidebarActiveView,
    contextDock,
    sidebarWidth,
    setToast,
    workspace,
    workspaceStateReady,
  ])
}
