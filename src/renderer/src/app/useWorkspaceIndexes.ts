import { useState, useEffect, useMemo, useCallback } from 'react'
import type { WorkspaceIndex, DiagnosticRecord } from '../../../shared/workspace-index'
import { collectDiagnostics } from '../lib/diagnostics'
import { useWorkspaceLinks } from '../hooks/useWorkspaceLinks'
import { useWorkspaceTags } from '../hooks/useWorkspaceTags'
import type { WorkspaceInfo } from '../components/Sidebar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseWorkspaceIndexesOptions {
  workspace: WorkspaceInfo | null
  setToast: (message: string) => void
  /** fileMtime 变化作为索引刷新信号 */
  fileMtime: Record<string, number>
}

export interface UseWorkspaceIndexesResult {
  workspaceIndex: WorkspaceIndex | null
  indexLoading: boolean
  diagnostics: DiagnosticRecord[]
  /** 链接图（反链面板 / 知识图谱共用） */
  linkGraph: ReturnType<typeof useWorkspaceLinks>['graph']
  linksLoading: boolean
  linksTruncated: boolean
  refreshLinks: () => void
  /** 标签索引（侧栏标签视图 / 文件树筛选） */
  tagIndex: ReturnType<typeof useWorkspaceTags>['index']
  tagsLoading: boolean
  tagsTruncated: boolean
  /** 手动刷新索引（ContextDock 按钮触发） */
  refreshIndex: () => void
  cancelIndex: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 工作区索引的完整生命周期：加载 → 增量刷新 → 事件订阅 → 取消。
 *
 * 职责边界：
 * - 管理 WorkspaceIndex 的加载/刷新/事件订阅
 * - 计算诊断记录（从索引派生）
 * - 管理链接图和标签索引（通过子 hooks）
 * - 提供手动刷新/取消操作
 *
 * 不包含：索引数据的 UI 展示（由 ContextDock / GraphView 消费）
 */
export function useWorkspaceIndexes({
  workspace,
  setToast,
  fileMtime,
}: UseWorkspaceIndexesOptions): UseWorkspaceIndexesResult {
  const [workspaceIndex, setWorkspaceIndex] = useState<WorkspaceIndex | null>(null)
  const [indexLoading, setIndexLoading] = useState(false)

  // --- 工作区索引加载与事件订阅 ---
  useEffect(() => {
    const api = window.desktopAPI?.workspace.index
    if (!api || !workspace?.path) {
      setWorkspaceIndex(null)
      setIndexLoading(false)
      return
    }
    let disposed = false
    setIndexLoading(true)
    api.load(workspace.path).then((result) => {
      if (disposed) return
      if (result.ok && result.data) setWorkspaceIndex(result.data)
      return api.refresh(workspace.path)
    }).then((result) => {
      if (disposed || !result) return
      if (result.ok && result.data) setWorkspaceIndex(result.data.index)
      setIndexLoading(false)
    }).catch(() => {
      if (!disposed) setIndexLoading(false)
    })
    const unsubscribe = api.onEvent((event) => {
      if (disposed) return
      if (event.type === 'updated') {
        setWorkspaceIndex(event.index)
        setIndexLoading(false)
      } else if (event.type === 'progress') {
        setIndexLoading(true)
      } else if (event.type === 'failed') {
        setIndexLoading(false)
        if (event.code !== 'CANCELLED') setToast(event.message ?? '索引扫描失败')
      }
    })
    return () => {
      disposed = true
      unsubscribe()
      void api.cancel(workspace.path)
    }
  }, [setToast, workspace?.path])

  // --- 诊断记录（从索引派生） ---
  const diagnostics = useMemo<DiagnosticRecord[]>(
    () => (workspaceIndex ? collectDiagnostics(workspaceIndex) : []),
    [workspaceIndex],
  )

  // --- 链接图与标签索引（fileMtime 变化触发刷新） ---
  const [linksRefreshTick, setLinksRefreshTick] = useState(0)
  useEffect(() => {
    setLinksRefreshTick((t) => t + 1)
  }, [fileMtime])

  const {
    graph: linkGraph,
    loading: linksLoading,
    truncated: linksTruncated,
    refresh: refreshLinks,
  } = useWorkspaceLinks({ workspace, refreshSignal: linksRefreshTick })

  const {
    index: tagIndex,
    loading: tagsLoading,
    truncated: tagsTruncated,
  } = useWorkspaceTags({ workspace, refreshSignal: linksRefreshTick })

  // --- 手动刷新/取消 ---
  const refreshIndex = useCallback(() => {
    if (!workspace?.path || !window.desktopAPI) return
    setIndexLoading(true)
    void window.desktopAPI.workspace.index.refresh(workspace.path).then((result) => {
      if (!result.ok) setIndexLoading(false)
    }).catch(() => setIndexLoading(false))
  }, [workspace?.path])

  const cancelIndex = useCallback(() => {
    if (workspace?.path) void window.desktopAPI?.workspace.index.cancel(workspace.path)
  }, [workspace?.path])

  return {
    workspaceIndex,
    indexLoading,
    diagnostics,
    linkGraph,
    linksLoading,
    linksTruncated,
    refreshLinks,
    tagIndex,
    tagsLoading,
    tagsTruncated,
    refreshIndex,
    cancelIndex,
  }
}
