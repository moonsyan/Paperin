import { ipcMain } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import type { WorkspaceIndexEvent } from '../../shared/workspace-index'
import type { WorkspaceIndexService } from '../indexing/workspace-index-service'

interface WorkspaceIndexRequest {
  root?: string
}

export interface WorkspaceIndexHandlerDependencies {
  workspaceIndexService: WorkspaceIndexService
  workspaceRootFor(webContentsId: number): string | null
  isTrustedPath(candidate: unknown): boolean
}

const samePath = (left: string, right: string): boolean =>
  left.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase() ===
  right.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()

const requestRoot = (
  event: Electron.IpcMainInvokeEvent,
  request: WorkspaceIndexRequest | undefined,
  deps: WorkspaceIndexHandlerDependencies,
): { root: string } | { error: { code: string } } => {
  const root = deps.workspaceRootFor(event.sender.id)
  if (!root) return { error: { code: 'NO_WORKSPACE' } }
  if (!deps.isTrustedPath(root)) return { error: { code: 'INVALID_PATH' } }
  if (request !== undefined && (request === null || typeof request !== 'object' || (request.root !== undefined && typeof request.root !== 'string'))) {
    return { error: { code: 'INVALID_PATH' } }
  }
  if (request?.root && !samePath(root, request.root)) return { error: { code: 'INVALID_PATH' } }
  return { root }
}

export const registerWorkspaceIndexHandlers = (
  deps: WorkspaceIndexHandlerDependencies,
): void => {
  const subscriptions = new Map<number, { root: string; unsubscribe: () => void }>()

  const ensureSubscription = (event: Electron.IpcMainInvokeEvent, root: string): void => {
    const id = event.sender.id
    const existing = subscriptions.get(id)
    if (existing?.root === root) return
    existing?.unsubscribe()
    const unsubscribe = deps.workspaceIndexService.subscribe(root, (payload: WorkspaceIndexEvent) => {
      if (typeof event.sender.isDestroyed !== 'function' || !event.sender.isDestroyed()) {
        event.sender.send(CHANNELS.WORKSPACE_INDEX_EVENT, payload)
      }
    })
    subscriptions.set(id, { root, unsubscribe })
    if (typeof event.sender.once === 'function') {
      event.sender.once('destroyed', () => {
        subscriptions.get(id)?.unsubscribe()
        subscriptions.delete(id)
      })
    }
  }

  ipcMain.handle(CHANNELS.WORKSPACE_INDEX_LOAD, async (event, request?: WorkspaceIndexRequest) => {
    const result = requestRoot(event, request, deps)
    if ('error' in result) return { ok: false, error: result.error }
    ensureSubscription(event, result.root)
    try {
      return { ok: true, data: await deps.workspaceIndexService.load(result.root) }
    } catch (error) {
      return { ok: false, error: { code: 'INDEX_FAILED', message: String(error) } }
    }
  })

  ipcMain.handle(CHANNELS.WORKSPACE_INDEX_REFRESH, async (event, request?: WorkspaceIndexRequest) => {
    const result = requestRoot(event, request, deps)
    if ('error' in result) return { ok: false, error: result.error }
    ensureSubscription(event, result.root)
    try {
      return { ok: true, data: await deps.workspaceIndexService.refresh(result.root) }
    } catch (error) {
      const code = (error as { code?: string })?.code ?? 'INDEX_FAILED'
      return { ok: false, error: { code, message: code === 'CANCELLED' ? undefined : String(error) } }
    }
  })

  ipcMain.handle(CHANNELS.WORKSPACE_INDEX_CANCEL, async (event, request?: WorkspaceIndexRequest) => {
    const result = requestRoot(event, request, deps)
    if ('error' in result) return { ok: false, error: result.error }
    deps.workspaceIndexService.cancel(result.root)
    return { ok: true }
  })
}
