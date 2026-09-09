import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceInfo } from '../components/Sidebar'
import type { WorkspaceLinkIndex } from '../../../shared/link-index'
import { buildBacklinkGraph } from '../lib/backlinks'
import type { BacklinkGraph } from '../lib/backlinks'

/* ==================== 工作区链接索引获取（反链/图谱数据源） ==================== */

interface UseWorkspaceLinksOptions {
  workspace: WorkspaceInfo | null
  /** 索引刷新信号：保存成功/文件树变化时递增（受 AUTO_SCAN_MIN_INTERVAL 限流） */
  refreshSignal: number
}

/**
 * 自动重扫的最小间隔：fileMtime 每次自动保存都会变化，若逐次重扫，
 * 大库（1000+ 文件）会持续占用主进程 IO 与渲染进程解析；主进程有
 * mtime 缓存但仍要 stat 全部文件并整体回传索引。30 秒内的自动信号
 * 直接忽略，工作区切换与手动 refresh() 不受限。
 */
const AUTO_SCAN_MIN_INTERVAL_MS = 30_000

export function useWorkspaceLinks({
  workspace,
  refreshSignal,
}: UseWorkspaceLinksOptions): {
  index: WorkspaceLinkIndex | null
  graph: BacklinkGraph | null
  loading: boolean
  truncated: boolean
  /** 立即重扫（打开图谱/切换到链接面板时调用，绕过限流） */
  refresh: () => void
} {
  const [index, setIndex] = useState<WorkspaceLinkIndex | null>(null)
  const [loading, setLoading] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const seqRef = useRef(0)
  const lastScanAtRef = useRef(0)
  const workspacePath = workspace?.path
  const workspaceTree = workspace?.tree
  const prevWorkspacePathRef = useRef<string | undefined>(undefined)

  const run = useCallback(async () => {
    if (!workspacePath || !window.desktopAPI) return
    const seq = ++seqRef.current
    lastScanAtRef.current = Date.now()
    setLoading(true)
    try {
      const result = await window.desktopAPI.workspace.indexLinks(workspacePath)
      if (seq !== seqRef.current) return
      if (result.ok && result.data) {
        setIndex(result.data)
        setTruncated(result.data.truncated)
      } else if (seq === seqRef.current) {
        // 索引失败不弹 toast 打扰（面板显示空态即可），保留旧数据
        setTruncated(false)
      }
    } catch {
      /* 同上：静默降级 */
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [workspacePath])

  /** 立即重扫：绕过限流（打开图谱/链接面板等用户主动场景） */
  const refresh = useCallback(() => {
    void run()
  }, [run])

  useEffect(() => {
    // 工作区切换：清空旧数据并重置限流，新工作区立即扫描
    if (prevWorkspacePathRef.current !== workspacePath) {
      prevWorkspacePathRef.current = workspacePath
      lastScanAtRef.current = 0
      seqRef.current++
      setIndex(null)
      setLoading(false)
      setTruncated(false)
    }
  }, [workspacePath])

  useEffect(() => {
    if (!workspacePath) return
    // 限流：距上次扫描不足间隔的自动信号（自动保存触发）直接忽略；
    // 首次（lastScanAt=0，含工作区切换重置）不受限
    if (Date.now() - lastScanAtRef.current < AUTO_SCAN_MIN_INTERVAL_MS) return
    const timer = setTimeout(() => void run(), 1_200)
    return () => clearTimeout(timer)
    // tree 引用变化 = 树刷新（新建/重命名等），同样走限流
  }, [workspacePath, workspaceTree, refreshSignal, run])

  const graph = useMemo(
    () => (index && workspacePath && workspaceTree
      ? buildBacklinkGraph(index, workspacePath, workspaceTree)
      : null),
    [index, workspacePath, workspaceTree],
  )

  return { index, graph, loading, truncated, refresh }
}
