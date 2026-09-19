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
  FileIdentityChangedError,
  readTextAutoEncoding,
  walkMarkdownTree,
} from './file-io'
import type { FolderTreeNode } from './file-io'
import { forgetLinkIndexCache } from './workspace-link-index'
import { forgetTagIndexCache } from './workspace-tag-index'
import { cacheSearchLines, getCachedSearchLines, runSharedRegexSearch } from './search-regex'
import { safeWorkspaceFileName } from './workspace-file-name'
import { forgetSnapshots, moveSnapshots } from '../history/version-store'
import { historyRoot } from './history-handlers'
import { DEFAULT_WORKSPACE_INDEX_MAX_FILES } from '../indexing/workspace-index-service'

/** 搜索和生产索引共享 5000 文档覆盖预算；命中数仍另有限制，避免结果传输失控。 */
const WORKSPACE_SEARCH_MAX_FILES = DEFAULT_WORKSPACE_INDEX_MAX_FILES

export interface WorkspaceHandlerDependencies {
  hasWorkspaceRoot(webContentsId: number): boolean
  setWorkspaceRoot(webContentsId: number, rootPath: string): void
  clearWorkspaceRoot(webContentsId: number): void
  workspaceRootFor(webContentsId: number): string | null
  isTrustedPath(candidate: unknown): boolean
  onWorkspaceOpened?(webContentsId: number, rootPath: string): void
  onWorkspaceClosed?(webContentsId: number, rootPath?: string): void
}

export const registerWorkspaceHandlers = ({
  hasWorkspaceRoot,
  setWorkspaceRoot,
  clearWorkspaceRoot,
  isTrustedPath,
  workspaceRootFor,
  onWorkspaceOpened,
  onWorkspaceClosed,
}: WorkspaceHandlerDependencies): void => {
  const scope = { workspaceRootFor, isTrustedPath }
  /** 便捷封装：目标路径必须属于调用窗口当前工作区（详见 workspace-scope.ts） */
  const withinWindow = (event: IpcMainInvokeEvent, candidate: string): Promise<boolean> =>
    withinCallerWorkspace(scope, event, candidate)

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
      setWorkspaceRoot(webContentsId, folderPath)
      if (previousRoot && previousRoot !== folderPath) onWorkspaceClosed?.(webContentsId, previousRoot)
      onWorkspaceOpened?.(webContentsId, folderPath)
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

  ipcMain.handle(
    CHANNELS.FILE_SEARCH_WORKSPACE,
    async (
      event,
      args: {
        dir: string
        query: string
        caseSensitive?: boolean
        regex?: boolean
      },
    ) => {
      try {
        if (
          !args ||
          typeof args.dir !== 'string' ||
          !args.dir ||
          typeof args.query !== 'string' ||
          !(await withinWindow(event, args.dir))
        ) {
          return { ok: false, error: { code: 'INVALID_TARGET' } }
        }
        const dirStat = await stat(args.dir).catch(() => null)
        if (!dirStat) return { ok: false, error: { code: 'NOT_FOUND' } }
        if (!dirStat.isDirectory()) return { ok: false, error: { code: 'NOT_DIRECTORY' } }
        const query = args.query.trim()
        if (!query) return { ok: true, data: { matches: [], truncated: false } }
        if (query.length > 256) {
          return {
            ok: false,
            error: { code: 'QUERY_TOO_LONG', message: '搜索关键词不能超过 256 个字符' },
          }
        }
        if (args.regex) {
          try {
            new RegExp(query, args.caseSensitive ? '' : 'i')
          } catch {
            return {
              ok: false,
              error: { code: 'INVALID_REGEX', message: '正则表达式不合法' },
            }
          }
        }
        // 搜索不复用 Renderer 的 2000 节点文件树预算：它需要与生产索引一致地
        // 覆盖 5000 篇文档；深度过滤仍由 walkMarkdownTree 保留。
        const treeBudget = { nodes: 0, truncated: false }
        const tree = await walkMarkdownTree(args.dir, 0, treeBudget, {
          maxFiles: WORKSPACE_SEARCH_MAX_FILES + 1,
        })
        const paths: string[] = []
        const flatten = (nodes: FolderTreeNode[]) => {
          for (const node of nodes) {
            if (node.children) {
              flatten(node.children)
              continue
            }
            paths.push(node.path)
          }
        }
        flatten(tree)
        const needle = args.caseSensitive ? query : query.toLowerCase()
        const matches: { path: string; line: number; preview: string }[] = []
        // 扫描覆盖截断（树预算/5000 文件上限）与匹配数达上限是两件事：
        // 后者用作循环提前退出标志，不能与前者共用变量——否则工作区超限时
        // 初值即为 true，第一个文件扫完就会退出，搜索覆盖塌缩到 1 个文件
        const scanTruncated = treeBudget.truncated || paths.length > WORKSPACE_SEARCH_MAX_FILES
        let matchCapped = false
        try {
          for (const path of paths.slice(0, WORKSPACE_SEARCH_MAX_FILES)) {
            const fileStat = await stat(path).catch(() => null)
            if (!fileStat || fileStat.size > 2 * 1024 * 1024) continue
            if (args.regex) {
              let content: string
              try {
                ;({ content } = await readTextAutoEncoding(path))
              } catch (error) {
                if (error instanceof FileIdentityChangedError) continue
                throw error
              }
              const regexMatches = await runSharedRegexSearch(
                content,
                query,
                Boolean(args.caseSensitive),
                200 - matches.length,
              )
              for (const match of regexMatches) matches.push({ path, ...match })
              if (matches.length >= 200) {
                matchCapped = true
                break
              }
              continue
            }
            let lines: string[]
            const cached = getCachedSearchLines(path)
            const mtimeSettled = Date.now() - fileStat.mtimeMs > 2500
            if (cached && mtimeSettled && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
              lines = cached.lines
            } else {
              let content: string
              try {
                ;({ content } = await readTextAutoEncoding(path))
              } catch (error) {
                if (error instanceof FileIdentityChangedError) continue
                throw error
              }
              lines = content.split(/\r?\n/)
              if (mtimeSettled) {
                cacheSearchLines(path, {
                  mtimeMs: fileStat.mtimeMs,
                  size: fileStat.size,
                  lines,
                })
              }
            }
            for (let index = 0; index < lines.length; index++) {
              const candidate = args.caseSensitive ? lines[index] : lines[index].toLowerCase()
              if (!candidate.includes(needle)) continue
              matches.push({ path, line: index + 1, preview: lines[index].trim().slice(0, 120) })
              if (matches.length >= 200) {
                matchCapped = true
                break
              }
            }
            if (matchCapped) break
          }
          return { ok: true, data: { matches, truncated: scanTruncated || matchCapped, scanTruncated, matchCapped } }
        } catch (error) {
          if (error instanceof Error && error.message === 'REGEX_TIMEOUT') {
            return {
              ok: false,
              error: { code: 'REGEX_TIMEOUT', message: '正则表达式匹配超时，请简化表达式' },
            }
          }
          throw error
        }
      } catch (error) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
      }
    },
  )
}
