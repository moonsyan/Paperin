import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { WorkspaceInfo } from '../../components/Sidebar'
import type { DocumentWorkspaceBridge } from './types'
import { useWorkspaceFiles } from './useWorkspaceFiles'

/**
 * WorkspaceController：工作区操作统一边界。
 *
 * Sidebar 右键菜单、命令面板、菜单栏和未来的索引订阅都只通过该控制器
 * 操作工作区；文件操作的 IPC 调用与冲突分支复用 useWorkspaceFiles，
 * 会话记录迁移仍经 DocumentWorkspaceBridge，控制器不直接读写
 * contentsRef / savedMap / fileMtime。
 */

export interface WorkspaceController {
  /** path 缺省时打开目录选择框 */
  open(path?: string): Promise<boolean>
  /**
   * 关闭工作区：当前先走"关闭全部标签"编排（含未保存确认与落账）。
   * 工作区视图状态清空与开始界面恢复由布局预设任务（Task 7A）接管。
   */
  close(): void
  createFile(dir: string, name?: string): Promise<boolean>
  renameFile(path: string, newName: string): Promise<boolean>
  moveFile(path: string, targetDir: string): Promise<boolean>
  deleteFile(path: string): Promise<boolean>
  openInNewWindow(path: string): void
  refresh(): Promise<void>
}

export interface UseWorkspaceControllerOptions {
  workspace: WorkspaceInfo | null
  /** 打开文件快照：移动文件夹前圈定受影响的脏文件 */
  openFiles: Array<{ id: string; name: string; path?: string; preview?: boolean }>
  savedMap: Record<string, boolean>
  fileMtime: Record<string, number>
  bridge: DocumentWorkspaceBridge
  setToast: Dispatch<SetStateAction<string>>
  /** 关闭全部标签的会话编排（含未保存确认），close 使用 */
  closeAllTabs: () => void
}

export function useWorkspaceController({
  workspace,
  openFiles,
  savedMap,
  fileMtime,
  bridge,
  setToast,
  closeAllTabs,
}: UseWorkspaceControllerOptions): WorkspaceController {
  const files = useWorkspaceFiles({ workspace, openFiles, savedMap, fileMtime, bridge, setToast })

  // silent/preserveActiveTab 均为 false：open 是显式的"打开工作区"入口，
  // 允许按布局记录重放活动标签（首次打开场景），与增删改后的刷新路径区分
  const open = useCallback(
    async (path?: string) => {
      await bridge.openFolder(path, false, false)
      return true
    },
    [bridge],
  )

  const close = useCallback(() => {
    closeAllTabs()
  }, [closeAllTabs])

  const createFile = useCallback(
    (dir: string, name?: string) => files.handleCreateFile(dir, name),
    [files],
  )
  const renameFile = useCallback(
    (path: string, newName: string) => files.handleRenameFile(path, newName),
    [files],
  )
  const moveFile = useCallback(
    (path: string, targetDir: string) => files.handleMoveFile(path, targetDir),
    [files],
  )
  const deleteFile = useCallback((path: string) => files.handleDeleteFile(path), [files])
  const refresh = useCallback(() => files.refreshWorkspace(), [files])

  return {
    open,
    close,
    createFile,
    renameFile,
    moveFile,
    deleteFile,
    openInNewWindow: files.handleOpenInNewWindow,
    refresh,
  }
}
