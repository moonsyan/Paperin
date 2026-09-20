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
  /** 可选闸门 ref（R11 前用于会话恢复）：开库时图谱标签会出现但不激活，
   *  避免盖住「打开资料→写作」。手动 openGraphView 仍可进入图谱。 */
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
 * - 打开工作区时自动展示图谱标签，但不激活（R11：保持文档/开始页上下文）
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

  // 打开文件夹即挂上图谱标签；R11 起默认不激活，避免打断首次「打开资料→写作」。
  const autoOpenRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (workspacePath && autoOpenRef.current !== workspacePath) {
      autoOpenRef.current = workspacePath
      setGraphTabOpen(true)
      setGraphTabActive(false)
      if (autoOpenActivateRef) autoOpenActivateRef.current = true
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
