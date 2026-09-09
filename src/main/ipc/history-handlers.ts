import { ipcMain } from 'electron'
import { join } from 'path'
import { app } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import {
  listSnapshots,
  readSnapshot,
  recordSnapshot,
} from '../history/version-store'

/* ==================== 版本历史（本地保存快照） ==================== */

export interface HistoryHandlersDependencies {
  isTrustedPath(candidate: unknown): boolean
  isFileTrustedForSave(candidate: unknown): boolean
}

/** 历史目录：userData/version-history（按路径哈希分目录，不写入工作区） */
export const historyRoot = (): string => join(app.getPath('userData'), 'version-history')

/** 已保存过的磁盘文件允许查询/记录历史（信任文件或信任根内均可） */
const canAccessHistory = (
  deps: HistoryHandlersDependencies,
  filePath: unknown,
): filePath is string =>
  typeof filePath === 'string' &&
  filePath.length > 0 &&
  (deps.isTrustedPath(filePath) || deps.isFileTrustedForSave(filePath))

export const registerHistoryHandlers = (deps: HistoryHandlersDependencies): void => {
  ipcMain.handle(CHANNELS.HISTORY_RECORD, async (_event, args: { path?: string }) => {
    try {
      if (!args || !canAccessHistory(deps, args.path)) {
        return { ok: false, error: { code: 'INVALID_TARGET' } }
      }
      const recorded = await recordSnapshot(historyRoot(), args.path)
      return { ok: true, data: { recorded } }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(CHANNELS.HISTORY_LIST, async (_event, args: { path?: string }) => {
    try {
      if (!args || !canAccessHistory(deps, args.path)) {
        return { ok: false, error: { code: 'INVALID_TARGET' } }
      }
      const snapshots = await listSnapshots(historyRoot(), args.path)
      return { ok: true, data: { snapshots } }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(
    CHANNELS.HISTORY_READ,
    async (_event, args: { path?: string; t?: unknown }) => {
      try {
        if (!args || !canAccessHistory(deps, args.path)) {
          return { ok: false, error: { code: 'INVALID_TARGET' } }
        }
        if (typeof args.t !== 'number') {
          return { ok: false, error: { code: 'INVALID_TARGET' } }
        }
        const content = await readSnapshot(historyRoot(), args.path, args.t)
        return { ok: true, data: { content } }
      } catch {
        // 快照不存在/时间戳非法统一返回 NOT_FOUND，不泄露文件系统细节
        return { ok: false, error: { code: 'NOT_FOUND' } }
      }
    },
  )
}
