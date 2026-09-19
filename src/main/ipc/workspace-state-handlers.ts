import { ipcMain } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import {
  parseWorkspaceDocuments,
  parseWorkspaceLayout,
  parseWorkspaceSettings,
} from '../../shared/workspace-state'
import { normalizeAttachmentDirectory } from './attachment-path'
import type { WorkspaceStateStore } from '../settings/workspace-state-store'

export interface WorkspaceStateHandlerDependencies {
  workspaceStateStore: WorkspaceStateStore
  workspaceRootFor(webContentsId: number): string | null
  workspaceStateError(error: unknown): { ok: boolean; error: { code: string; message?: string } }
}

export const registerWorkspaceStateHandlers = ({
  workspaceStateStore,
  workspaceRootFor,
  workspaceStateError,
}: WorkspaceStateHandlerDependencies): void => {
  ipcMain.handle(CHANNELS.WORKSPACE_STATE_LOAD, async (event) => {
    const rootPath = workspaceRootFor(event.sender.id)
    if (!rootPath) return { ok: false, error: { code: 'NO_WORKSPACE' } }
    try {
      return { ok: true, data: await workspaceStateStore.load(rootPath) }
    } catch (error) {
      return workspaceStateError(error)
    }
  })

  ipcMain.handle(CHANNELS.WORKSPACE_STATE_SAVE_SETTINGS, async (event, value: unknown) => {
    const rootPath = workspaceRootFor(event.sender.id)
    if (!rootPath) return { ok: false, error: { code: 'NO_WORKSPACE' } }
    try {
      await workspaceStateStore.writeSettings(rootPath, parseWorkspaceSettings(value))
      return { ok: true }
    } catch (error) {
      return workspaceStateError(error)
    }
  })

  ipcMain.handle(CHANNELS.WORKSPACE_STATE_SAVE_LAYOUT, async (event, value: unknown) => {
    const rootPath = workspaceRootFor(event.sender.id)
    if (!rootPath) return { ok: false, error: { code: 'NO_WORKSPACE' } }
    try {
      await workspaceStateStore.writeLayout(rootPath, parseWorkspaceLayout(value))
      return { ok: true }
    } catch (error) {
      return workspaceStateError(error)
    }
  })

  ipcMain.handle(CHANNELS.WORKSPACE_STATE_SAVE_DOCUMENTS, async (event, value: unknown) => {
    const rootPath = workspaceRootFor(event.sender.id)
    if (!rootPath) return { ok: false, error: { code: 'NO_WORKSPACE' } }
    try {
      await workspaceStateStore.writeDocuments(rootPath, parseWorkspaceDocuments(value))
      return { ok: true }
    } catch (error) {
      return workspaceStateError(error)
    }
  })

  ipcMain.handle(CHANNELS.WORKSPACE_ATTACHMENT_GET, async (event) => {
    const rootPath = workspaceRootFor(event.sender.id)
    if (!rootPath) return { ok: false, error: { code: 'NO_WORKSPACE' } }
    try {
      const state = await workspaceStateStore.load(rootPath)
      return { ok: true, data: { directory: state.settings.editor.attachmentDirectory } }
    } catch (error) {
      return workspaceStateError(error)
    }
  })

  ipcMain.handle(CHANNELS.WORKSPACE_ATTACHMENT_SET, async (event, value: unknown) => {
    const rootPath = workspaceRootFor(event.sender.id)
    if (!rootPath) return { ok: false, error: { code: 'NO_WORKSPACE' } }
    if (value !== null && typeof value !== 'string') {
      return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
    }
    const directory = value === null ? null : normalizeAttachmentDirectory(value)
    if (value !== null && !directory) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
    }
    try {
      // 读-改-写整体入队：避免并发窗口的后写者基于旧快照覆盖先写者的其他设置字段
      const next = await workspaceStateStore.updateSettings(rootPath, (current) => ({
        ...current,
        editor: { ...current.editor, attachmentDirectory: directory },
      }))
      return { ok: true, data: { directory: next.editor.attachmentDirectory } }
    } catch (error) {
      return workspaceStateError(error)
    }
  })
}
