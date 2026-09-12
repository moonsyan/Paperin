import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { WorkspaceInfo } from '../components/Sidebar'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseGraphViewOptions {
  workspace: WorkspaceInfo | null
  /** 用户主动打开时强制刷新链接（绕过自动扫描限流，确保展示最新链接） */
  refreshLinks: () => void
  setToast: (message: string) => void
  /** 可选闸门 ref：值为 false 时 auto-open 只出现标签、不激活（不盖住编辑器），
   *  消费一次后自动复位为 true。会话恢复路径用它避免图谱盖住恢复的文档；
   *  不传则保持"打开工作区即激活图谱"的既有行为。 */
  autoOpenActivateRef?: MutableRefObject<boolean>
}

export interface UseGraphViewResult {
  graphTabOpen: boolean
  setGraphTabOpen: Dispatch<SetStateAction<boolean>>
  graphTabActive: boolean
  setGraphTabActive: Dispatch<SetStateAction<boolean>>
  /** 用户主动打开图谱（命令/菜单触发）：无工作区时只提示，不打开标签 */
  openGraphView: () => void
  /** 关闭图谱标签页 */
  closeGraphView: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 知识图谱标签页的生命周期管理。
 *
 * 职责边界：
 * - 图谱作为内置标签页固定在标签栏末尾
 * - tabOpen 控制标签存在，tabActive 控制编辑器区显示图谱还是文档
 * - 打开工作区时自动展示图谱（含会话恢复重开工作区）
 * - 用户主动打开时的前置校验与链接刷新
 * - 切到文件标签即取消激活（由 TabBar onSwitch 调用 setGraphTabActive(false)）
 *
 * 不包含：图谱设置持久化（由 useAppSettings 管理）、图谱数据（由 useWorkspaceIndexes 提供）
 */
export function useGraphView({
  workspace,
  refreshLinks,
  setToast,
  autoOpenActivateRef,
}: UseGraphViewOptions): UseGraphViewResult {
  const [graphTabOpen, setGraphTabOpen] = useState(false)
  const [graphTabActive, setGraphTabActive] = useState(false)
  const workspacePath = workspace?.path

  // 打开文件夹即自动展示整个工作区的知识图谱。
  // 会话恢复（重启应用）打开的工作区经闸门 ref 抑制激活：图谱标签照常出现，
  // 但用户上次编辑的文档不被盖住——激活态留给用户点标签或命令时再进入
  const autoOpenRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (workspacePath && autoOpenRef.current !== workspacePath) {
      autoOpenRef.current = workspacePath
      setGraphTabOpen(true)
      const activate = autoOpenActivateRef ? autoOpenActivateRef.current : true
      // 无论本次是否激活，闸门只消费一次并复位，后续打开文件夹恢复默认行为
      //（即使本次 workspace 建立失败，下一次打开也只多一次"不激活"，可接受）
      if (autoOpenActivateRef) autoOpenActivateRef.current = true
      if (activate) setGraphTabActive(true)
    }
    if (!workspacePath) autoOpenRef.current = undefined
  }, [workspacePath, autoOpenActivateRef])

  const openGraphView = useCallback(() => {
    if (!workspacePath) {
      setToast('请先打开文件夹（工作区）后再查看知识图谱')
      return
    }
    refreshLinks()
    setGraphTabOpen(true)
    setGraphTabActive(true)
  }, [refreshLinks, setToast, workspacePath])

  const closeGraphView = useCallback(() => {
    setGraphTabOpen(false)
    setGraphTabActive(false)
  }, [])

  return {
    graphTabOpen,
    setGraphTabOpen,
    graphTabActive,
    setGraphTabActive,
    openGraphView,
    closeGraphView,
  }
}
