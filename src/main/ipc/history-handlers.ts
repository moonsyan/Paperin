import { ipcMain } from 'electron'
import { join } from 'path'
import { app } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import {
  listSnapshots,
  readSnapshot,
  recordSnapshot,
} from '../history/version-store'
import { isPathAuthorizedForReadOrSave } from '../trusted-paths'

/* ==================== 版本历史（本地保存快照） ==================== */

export interface HistoryHandlersDependencies {
  isTrustedPath(candidate: unknown): boolean
  isFileTrustedForSave(candidate: string): Promise<boolean>
}

/** 历史目录：userData/version-history（按路径哈希分目录，不写入工作区） */
export const historyRoot = (): string => join(app.getPath('userData'), 'version-history')

/** 已保存过的磁盘文件允许查询/记录历史；真实路径必须仍在授权范围内 */
const canAccessHistory = async (filePath: unknown): Promise<boolean> => {
  if (typeof filePath !== 'string' || filePath.length === 0) return false
  return await isPathAuthorizedForReadOrSave(filePath)
}

export const registerHistoryHandlers = (_deps: HistoryHandlersDependencies): void => {
  ipcMain.handle(CHANNELS.HISTORY_RECORD, async (_event, args: { path?: string }) => {
    try {
      const filePath = args?.path
      if (typeof filePath !== 'string' || !(await canAccessHistory(filePath))) {
        return { ok: false, error: { code: 'INVALID_TARGET' } }
      }
      const recorded = await recordSnapshot(historyRoot(), filePath)
      return { ok: true, data: { recorded } }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(CHANNELS.HISTORY_LIST, async (_event, args: { path?: string }) => {
    try {
      const filePath = args?.path
      if (typeof filePath !== 'string' || !(await canAccessHistory(filePath))) {
        return { ok: false, error: { code: 'INVALID_TARGET' } }
      }
      const snapshots = await listSnapshots(historyRoot(), filePath)
      return { ok: true, data: { snapshots } }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(
    CHANNELS.HISTORY_READ,
    async (_event, args: { path?: string; t?: unknown }) => {
      try {
        const filePath = args?.path
        if (typeof filePath !== 'string' || !(await canAccessHistory(filePath))) {
          return { ok: false, error: { code: 'INVALID_TARGET' } }
        }
        if (typeof args.t !== 'number') {
          return { ok: false, error: { code: 'INVALID_TARGET' } }
        }
        const content = await readSnapshot(historyRoot(), filePath, args.t)
        return { ok: true, data: { content } }
      } catch {
        // 快照不存在/时间戳非法统一返回 NOT_FOUND，不泄露文件系统细节
        return { ok: false, error: { code: 'NOT_FOUND' } }
      }
    },
  )
}
