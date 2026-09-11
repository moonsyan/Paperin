import { useCallback, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ContextDockPanel, ContextDockState } from '../../components/ContextDock/context-dock-state'

/**
 * 面板导航与反链跳转：
 * - openOutlinePanel / openContextPanel：ContextDock 面板展开；
 * - handleOpenBacklink：反链/出链点选后接力文档内搜索定位；
 * - handleOpenVersionHistory：仅磁盘文件有快照记录。
 *
 * 反链跳转的 seq 机制：并发点击时只保留最后一次，避免旧请求返回后覆盖新选择。
 */
export function usePanelNavigation({
  setSidebarCollapsed,
  setContextDockState,
  setFocusOutlineTick,
  setSearchMode,
  setSearchPref,
  setSearchEpoch,
  handleSelectWorkspaceFile,
  activeFilePath,
  setVersionHistoryOpen,
  setToast,
}: {
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  setContextDockState: Dispatch<SetStateAction<ContextDockState>>
  setFocusOutlineTick: Dispatch<SetStateAction<number>>
  setSearchMode: (mode: 'find' | 'replace' | 'none') => void
  setSearchPref: Dispatch<
    SetStateAction<{
      query: string
      useRegex: boolean
      caseSensitive: boolean
      wholeWord: boolean
      replacement: string
    }>
  >
  setSearchEpoch: Dispatch<SetStateAction<number>>
  handleSelectWorkspaceFile: (path: string, pinned?: boolean) => Promise<boolean>
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

  // 打开反链/出链指向的文件并接力文档内搜索定位（与工作区搜索结果点选同一模式）
  const backlinkSelectSeqRef = useRef(0)
  const handleOpenBacklink = useCallback(
    (path: string, query: string) => {
      const seq = ++backlinkSelectSeqRef.current
      void (async () => {
        const ok = await handleSelectWorkspaceFile(path)
        if (seq !== backlinkSelectSeqRef.current || !ok) return
        if (query) {
          setSearchPref((prev) => ({ ...prev, query, useRegex: false }))
          setSearchEpoch((e) => e + 1)
          setSearchMode('find')
        }
      })()
    },
    [handleSelectWorkspaceFile, setSearchEpoch, setSearchMode, setSearchPref],
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
