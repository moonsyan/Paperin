import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { realpath, rename, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, sep } from 'path'
import { CHANNELS } from '../../shared/ipc/channels'
import { schedulePersistTrust } from '../session-trust'
import { isPathAuthorizedForReadOrSave, trustDirectory } from '../trusted-paths'
import { withinCallerWorkspace } from './workspace-scope'
import {
  carryKnownFileState,
  forgetKnownFileState,
  walkMarkdownTree,
} from './file-io'
import { forgetLinkIndexCache } from './workspace-link-index'
import { forgetTagIndexCache } from './workspace-tag-index'
import { safeWorkspaceFileName } from './workspace-file-name'
import { forgetSnapshots, moveSnapshots } from '../history/version-store'
import { historyRoot } from './history-handlers'
import { registerWorkspaceSearchHandler, type WorkspaceSearchHandlerDependencies } from './workspace-search-handler'

export interface WorkspaceHandlerDependencies {
  hasWorkspaceRoot(webContentsId: number): boolean
  setWorkspaceRoot(webContentsId: number, rootPath: string): void
  clearWorkspaceRoot(webContentsId: number): void
  workspaceRootFor(webContentsId: number): string | null
  isTrustedPath(candidate: unknown): boolean
  onWorkspaceOpened?(webContentsId: number, rootPath: string): void
  onWorkspaceClosed?(webContentsId: number, rootPath?: string): void
  getSearchSnapshot?: WorkspaceSearchHandlerDependencies['getSearchSnapshot']
}

export const registerWorkspaceHandlers = ({
  hasWorkspaceRoot,
  setWorkspaceRoot,
  clearWorkspaceRoot,
  isTrustedPath,
  workspaceRootFor,
  onWorkspaceOpened,
  onWorkspaceClosed,
  getSearchSnapshot,
}: WorkspaceHandlerDependencies): void => {
  const scope = { workspaceRootFor, isTrustedPath }
  /** 便捷封装：目标路径必须属于调用窗口当前工作区（详见 workspace-scope.ts） */
  const withinWindow = (event: IpcMainInvokeEvent, candidate: string): Promise<boolean> =>
    withinCallerWorkspace(scope, event, candidate)

  registerWorkspaceSearchHandler({
    withinWindow,
    getSearchSnapshot: getSearchSnapshot ?? (() => null),
  })

  ipcMain.handle(CHANNELS.FILE_OPEN_FOLDER, async (event, args?: { path?: string }) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, error: { code: 'WINDOW_NOT_FOUND' } }
    const webContentsId = event.sender.id
    if (!hasWorkspaceRoot(webContentsId)) {
      event.sender.once('destroyed', () => {
        clearWorkspaceRoot(webContentsId)
      })
    }

    let folderPath = args?.path
    if (!folderPath) {
      const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: { code: 'CANCELLED' } }
      }
      folderPath = result.filePaths[0]
    }
    if (typeof folderPath !== 'string' || !folderPath) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    if (args?.path && !isTrustedPath(folderPath)) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    const folderStat = await stat(folderPath).catch(() => null)
    if (!folderStat) return { ok: false, error: { code: 'NOT_FOUND' } }
    if (!folderStat.isDirectory()) return { ok: false, error: { code: 'NOT_DIRECTORY' } }

    try {
      const budget = { nodes: 0, truncated: false }
      const children = await walkMarkdownTree(folderPath, 0, budget)
      trustDirectory(folderPath, { essential: true })
      const previousRoot = workspaceRootFor?.(webContentsId)
      const rootChanged = previousRoot !== folderPath
      setWorkspaceRoot(webContentsId, folderPath)
      if (previousRoot && rootChanged) onWorkspaceClosed?.(webContentsId, previousRoot)
      if (rootChanged) onWorkspaceOpened?.(webContentsId, folderPath)
      schedulePersistTrust(true)
      return {
        ok: true,
        data: {
          path: folderPath,
          name: folderPath.split(/[/\\]/).pop() || 'workspace',
          tree: children,
          truncated: budget.truncated,
        },
      }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(CHANNELS.FILE_CREATE, async (event, args: { dir: string; name: string }) => {
    if (!args || typeof args.dir !== 'string' || !args.dir) {
      return { ok: false, error: { code: 'INVALID_TARGET' } }
    }
    if (!(await withinWindow(event, args.dir))) {
      return { ok: false, error: { code: 'INVALID_TARGET' } }
    }
    const base = safeWorkspaceFileName(args.name)
    if (!base) return { ok: false, error: { code: 'INVALID_NAME' } }
    const dirStat = await stat(args.dir).catch(() => null)
    if (!dirStat?.isDirectory()) return { ok: false, error: { code: 'INVALID_TARGET' } }
    const extMatch = base.match(/\.(md|markdown)$/i)
    const ext = extMatch ? extMatch[0] : '.md'
    const stem = extMatch ? base.slice(0, -ext.length) : base
    const initialName = extMatch ? base : `${base}${ext}`
    let name = initialName
    let target = join(args.dir, name)
    let available = false
    for (let index = 1; index <= 1000; index++) {
      name = index === 1 ? initialName : `${stem} ${index}${ext}`
      target = join(args.dir, name)
      try { await stat(target) } catch { available = true; break }
    }
    if (!available) return { ok: false, error: { code: 'NAME_EXHAUSTED' } }
    if (!(await withinWindow(event, args.dir)) || !(await withinWindow(event, target))) {
      return { ok: false, error: { code: 'INVALID_TARGET' } }
    }
    try {
      await writeFile(target, `# ${name.replace(/\.(md|markdown)$/i, '')}\n\n`, { encoding: 'utf-8', flag: 'wx' })
      return { ok: true, data: { path: target, name } }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(CHANNELS.FILE_RENAME, async (event, args: { path: string; newName: string }) => {
    if (!args || typeof args.path !== 'string' || !args.path) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    if (!(await withinWindow(event, args.path))) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    const name = safeWorkspaceFileName(args.newName)
    if (!name) return { ok: false, error: { code: 'INVALID_NAME' } }
    const target = join(dirname(args.path), name)
    if (target !== args.path && await stat(target).catch(() => null)) {
      const [sourceRealPath, targetRealPath] = await Promise.all([realpath(args.path), realpath(target)]).catch(() => ['', ''])
      const normalized = (value: string) => value.replace(/[\\/]+/g, sep).toLowerCase()
      if (sourceRealPath !== targetRealPath || normalized(args.path) !== normalized(target)) {
        return { ok: false, error: { code: 'EXISTS' } }
      }
    }
    if (!(await withinWindow(event, args.path)) || !(await withinWindow(event, target))) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    try {
      await rename(args.path, target)
      const targetStat = await stat(target).catch(() => null)
      forgetLinkIndexCache(args.path)
      forgetTagIndexCache(args.path)
      await moveSnapshots(historyRoot(), args.path, target)
      if (targetStat) carryKnownFileState(args.path, target, { mtimeMs: targetStat.mtimeMs, size: targetStat.size })
      else forgetKnownFileState(args.path)
      return { ok: true, data: { path: target, name, modifiedTime: targetStat?.mtimeMs ?? 0 } }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(CHANNELS.FILE_MOVE, async (event, args: { path: string; targetDir: string }) => {
    try {
      if (
        !args ||
        typeof args.path !== 'string' ||
        !args.path ||
        typeof args.targetDir !== 'string' ||
        !args.targetDir ||
        !(await withinWindow(event, args.path)) ||
        !(await withinWindow(event, args.targetDir))
      ) {
        return { ok: false, error: { code: 'INVALID_TARGET' } }
      }
      const dirStat = await stat(args.targetDir).catch(() => null)
      if (!dirStat?.isDirectory()) return { ok: false, error: { code: 'INVALID_TARGET' } }
      const normalize = (value: string) => {
        const normalized = value.replace(/[\\/]+/g, sep)
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized
      }
      const source = normalize(args.path)
      const targetDir = normalize(args.targetDir)
      if (targetDir === source || targetDir.startsWith(source + sep)) return { ok: false, error: { code: 'INVALID_TARGET' } }
      const target = join(args.targetDir, basename(args.path))
      if (target !== args.path && await stat(target).catch(() => null)) return { ok: false, error: { code: 'EXISTS' } }
      if (
        !(await withinWindow(event, args.path))
        || !(await withinWindow(event, args.targetDir))
        || !(await withinWindow(event, target))
      ) {
        return { ok: false, error: { code: 'INVALID_TARGET' } }
      }
      await rename(args.path, target)
      forgetLinkIndexCache(args.path)
      forgetTagIndexCache(args.path)
      await moveSnapshots(historyRoot(), args.path, target)
      const targetStat = await stat(target).catch(() => null)
      if (targetStat) carryKnownFileState(args.path, target, { mtimeMs: targetStat.mtimeMs, size: targetStat.size })
      else forgetKnownFileState(args.path)
      return { ok: true, data: { path: target, name: basename(target), modifiedTime: targetStat?.mtimeMs ?? 0 } }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(CHANNELS.FILE_STAT, async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath) return { ok: false, error: { code: 'INVALID_PATH' } }
    if (!(await isPathAuthorizedForReadOrSave(filePath))) return { ok: false, error: { code: 'INVALID_PATH' } }
    try { return { ok: true, data: { modifiedTime: (await stat(filePath)).mtimeMs } } } catch { return { ok: false, error: { code: 'NOT_FOUND' } } }
  })

  ipcMain.handle(CHANNELS.FILE_DELETE, async (event, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath || !(await withinWindow(event, filePath))) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    try {
      if (!(await stat(filePath)).isFile()) return { ok: false, error: { code: 'NOT_FILE' } }
      if (!(await withinWindow(event, filePath))) return { ok: false, error: { code: 'INVALID_PATH' } }
      await shell.trashItem(filePath)
      forgetKnownFileState(filePath)
      forgetLinkIndexCache(filePath)
      forgetTagIndexCache(filePath)
      // 清理版本快照，避免已删除文件的快照目录在 userData 下无界残留
      await forgetSnapshots(historyRoot(), filePath)
      return { ok: true, data: { name: basename(filePath) } }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

}
