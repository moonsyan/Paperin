import { app } from 'electron'
import { dirname, join } from 'path'
import { getSetting } from '../settings/settings-store'
import { WorkspaceStateStore, WorkspaceStateStoreError } from '../settings/workspace-state-store'
import { allowImageDirectory } from '../image-protocol'
import {
  isFileTrustedForSave,
  isPathTrusted,
  touchTrustedRoot,
  trustDirectory,
  trustFileForSave,
} from '../trusted-paths'
import { restoreTrustFromDisk } from '../session-trust'
import { registerDocxExportHandler } from './export-docx'
import { registerExportHandlers } from './export-handlers'
import { registerFileHandlers } from './file-handlers'
import { registerHistoryHandlers } from './history-handlers'
import { registerImageHostHandlers } from './image-host-handlers'
import { registerSettingsHandlers } from './settings-handlers'
import { disposeSharedRegexWorker } from './search-regex'
import { registerWindowHandlers } from './window-handlers'
import { registerWorkspaceHandlers } from './workspace-handlers'
import { registerWorkspaceLinkIndexHandlers } from './workspace-link-index'
import { registerWorkspaceStateHandlers } from './workspace-state-handlers'
import { registerWorkspaceTagIndexHandlers } from './workspace-tag-index'
import { registerWorkspaceIndexHandlers } from './workspace-index-handlers'
import { createFileWorkspaceIndexCache, createWorkspaceIndexService } from '../indexing/workspace-index-service'
import { createWorkspaceIndexFilesystemDependencies } from '../indexing/workspace-index-filesystem'
import { createFsWatchAdapter, createWorkspaceFileWatcher } from '../indexing/workspace-file-watcher'

const workspaceStateStore = new WorkspaceStateStore()
const workspaceRootsByWebContents = new Map<number, string>()

const workspaceRootFor = (webContentsId: number): string | null =>
  workspaceRootsByWebContents.get(webContentsId) ?? null

const workspaceStateError = (err: unknown) => {
  if (err instanceof WorkspaceStateStoreError) {
    return { ok: false, error: { code: err.code } }
  }
  return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
}

/**
 * L8：路径必须属于已授权根（已打开的文档/工作区、会话恢复路径、
 * 用户经原生对话框选择的目录、应用自有目录）。渲染进程无法自行授权，
 * 阻断未来 XSS 把文件 IPC 变成全盘读写删。
 */
const ensureTrusted = (path: unknown): boolean =>
  typeof path === 'string' && path.length > 0 && isPathTrusted(path)

app.on('before-quit', () => {
  disposeSharedRegexWorker()
})

/** IPC 注册唯一入口：仅负责信任根引导与按业务分组装配，不承载具体 handler。 */
export function registerIpcHandlers(): void {
  // 应用自有图片目录（未保存文档的粘贴图片存储处）始终授信；
  // 它在每个新进程中由保存流程重建信任，此处显式登记避免图片管理面板 404。
  // evictable=false：满员淘汰时最后保护它（它不是用户可重开的会话对象）
  trustDirectory(join(app.getPath('userData'), 'images'), { essential: true, evictable: false })
  // 会话恢复路径预授权——新进程的信任根初始为空，渲染端恢复会话时
  // FILE_READ/SEARCH 等必须能命中上次会话已打开的文档与工作区。
  // H 修复：信任清单来自主进程私有的 trusted-roots.json（用户真实授权后
  // 由主进程写入，渲染层无法伪造），而非渲染层可写的 settings.json 会话字段——
  // 否则 XSS 可伪造 workspacePath 使任意目录在重启后获得完整信任。
  void restoreTrustFromDisk().then((restored) => {
    if (restored) return
    // 升级迁移兜底：首次升级无持久化清单时，回退到会话文件的文件级信任
    // （散档可恢复）；绝不信任会话里的工作区路径——那是渲染层可写的字段
    void getSetting('session').then(async (raw) => {
      const session = raw as { files?: { path?: string }[] } | undefined
      const files = session?.files ?? []
      for (let i = files.length - 1; i >= 0; i--) {
        const p = files[i]?.path
        if (typeof p === 'string' && p) {
          allowImageDirectory(dirname(p))
          await trustFileForSave(p)
        }
      }
    })
  })

  registerFileHandlers({ isTrustedPath: ensureTrusted })

  const workspaceIndexService = createWorkspaceIndexService({
    ...createWorkspaceIndexFilesystemDependencies(),
    cacheStore: createFileWorkspaceIndexCache(() => join(app.getPath('userData'), 'workspace-index-cache')),
  })
  const watchers = new Map<number, { root: string; watcher: ReturnType<typeof createWorkspaceFileWatcher> }>()
  registerWorkspaceHandlers({
    hasWorkspaceRoot: (webContentsId) => workspaceRootsByWebContents.has(webContentsId),
    workspaceRootFor: (webContentsId) => workspaceRootsByWebContents.get(webContentsId) ?? null,
    setWorkspaceRoot: (webContentsId, rootPath) => {
      workspaceRootsByWebContents.set(webContentsId, rootPath)
      touchTrustedRoot(rootPath)
    },
    clearWorkspaceRoot: (webContentsId) => {
      const current = workspaceRootsByWebContents.get(webContentsId)
      if (current) {
        watchers.get(webContentsId)?.watcher.stop()
        watchers.delete(webContentsId)
        workspaceIndexService.dispose(current)
      }
      return workspaceRootsByWebContents.delete(webContentsId)
    },
    isTrustedPath: ensureTrusted,
    onWorkspaceClosed: (webContentsId, rootPath) => {
      watchers.get(webContentsId)?.watcher.stop()
      watchers.delete(webContentsId)
      workspaceIndexService.dispose(rootPath)
    },
    onWorkspaceOpened: (webContentsId, rootPath) => {
      watchers.get(webContentsId)?.watcher.stop()
      const watcher = createWorkspaceFileWatcher({ watch: createFsWatchAdapter() })
      watcher.start(rootPath, (change) => {
        const invalidation =
          change.kind === 'rescan'
            ? change
            : {
                kind: 'changes' as const,
                markdownPaths: change.markdownPaths,
                resourcePaths: change.resourcePaths,
              }
        void workspaceIndexService.refresh(rootPath, { invalidation }).catch(() => undefined)
      })
      watchers.set(webContentsId, { root: rootPath, watcher })
    },
  })
  registerWorkspaceIndexHandlers({ workspaceIndexService, workspaceRootFor, isTrustedPath: ensureTrusted })

  registerWorkspaceStateHandlers({ workspaceStateStore, workspaceRootFor, workspaceStateError })

  registerWorkspaceLinkIndexHandlers({ workspaceRootFor, isTrustedPath: ensureTrusted })

  registerWorkspaceTagIndexHandlers({ workspaceRootFor, isTrustedPath: ensureTrusted })

  registerHistoryHandlers({ isTrustedPath: ensureTrusted, isFileTrustedForSave })

  registerDocxExportHandler()

  registerWindowHandlers({ isTrustedPath: ensureTrusted })

  registerExportHandlers()

  registerSettingsHandlers()

  registerImageHostHandlers()
}
