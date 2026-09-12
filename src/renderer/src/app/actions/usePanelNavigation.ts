import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ContextDockPanel, ContextDockState } from '../../components/ContextDock/context-dock-state'
import type { WorkspaceViewModel } from '../workspace/workspace-view-model'

/**
 * 面板导航与反链跳转：
 * - openOutlinePanel / openContextPanel：ContextDock 面板展开；
 * - handleOpenBacklink：反链/出链点选后接力文档内搜索定位；
 * - handleOpenVersionHistory：仅磁盘文件有快照记录。
 *
 * 打开文件、并发守卫与搜索接力统一由 WorkspaceViewModel.reveal 承担，
 * 本模块只负责把点击转换成一次 reveal 请求。
 */
export function usePanelNavigation({
  setSidebarCollapsed,
  setContextDockState,
  setFocusOutlineTick,
  reveal,
  activeFilePath,
  setVersionHistoryOpen,
  setToast,
}: {
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  setContextDockState: Dispatch<SetStateAction<ContextDockState>>
  setFocusOutlineTick: Dispatch<SetStateAction<number>>
  reveal: WorkspaceViewModel['reveal']
  activeFilePath: string | undefined
  setVersionHistoryOpen: Dispatch<SetStateAction<boolean>>
  setToast: (message: string) => void
}) {
  /** 大纲面板：确保侧栏展开后延迟一拍触发定位 tick（M5 时序约束） */
  const openOutlinePanel = useCallback(() => {
    setSidebarCollapsed(false)
    setContextDockState((current) => ({ ...current, panel: 'outline', visibility: 'expanded' }))
    // M5：侧栏折叠时组件重新挂载，挂载时 lastOutlineTickRef 初始化为当前 tick，
    // 同一批渲染内递增的 tick 会被新实例当作"已消费"，Tab 永远切不过去。
    // 延迟一拍再递增，保证展开后的新实例能消费到这次切换
    setTimeout(() => setFocusOutlineTick((t) => t + 1), 0)
  }, [setContextDockState, setFocusOutlineTick, setSidebarCollapsed])

  const openContextPanel = useCallback(
    (panel: ContextDockPanel) => {
      setContextDockState((current) => ({ ...current, panel, visibility: 'expanded' }))
    },
    [setContextDockState],
  )

  // 打开反链/出链指向的文件并接力文档内搜索定位。
  // 反链跳转打开查找栏（用户需要看到命中并逐条跳转），并强制非正则匹配
  // ——链接目标按字面量查找更符合预期。
  const handleOpenBacklink = useCallback(
    (path: string, query: string) => {
      void reveal(
        query ? { path, search: { query, useRegex: false, openFindBar: true } } : { path },
      )
    },
    [reveal],
  )

  /** 打开版本历史：仅磁盘文件有快照记录 */
  const handleOpenVersionHistory = useCallback(() => {
    if (!activeFilePath) {
      setToast('当前文档尚未保存到磁盘，暂无版本历史')
      return
    }
    setVersionHistoryOpen(true)
  }, [activeFilePath, setToast, setVersionHistoryOpen])

  return {
    openOutlinePanel,
    openContextPanel,
    handleOpenBacklink,
    handleOpenVersionHistory,
  }
}
