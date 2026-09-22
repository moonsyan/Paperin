import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import { registerWorkspaceIndexHandlers } from './workspace-index-handlers'
import type {
  WorkspaceIndexEvent,
  WorkspaceIndexService,
  WorkspaceIndexResult,
} from '../indexing/workspace-index-service'
import type { WorkspaceIndex } from '../../shared/workspace-index'
import { createInitialWorkspaceCoverage } from '../../shared/workspace-coverage'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

type CapturedHandler = (event: { sender: { id: number; send: ReturnType<typeof vi.fn> } }, ...args: unknown[]) => Promise<unknown>

const getHandler = (channel: string): CapturedHandler => {
  const call = vi.mocked(ipcMain.handle).mock.calls.find(([registered]) => registered === channel)
  if (!call) throw new Error(`通道未注册：${channel}`)
  return call[1] as unknown as CapturedHandler
}

const createIndex = (): WorkspaceIndex => ({
  workspacePath: 'D:/notes',
  generatedAt: '2026-08-28T00:00:00.000Z',
  generation: 1,
  complete: true,
  truncated: false,
  coverage: createInitialWorkspaceCoverage(),
  documents: {},
  links: [],
  tags: [],
  assets: [],
  diagnostics: [],
})

const createService = (): WorkspaceIndexService & {
  emit(event: WorkspaceIndexEvent): void
  load: ReturnType<typeof vi.fn>
  refresh: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
} => {
  let listener: ((event: WorkspaceIndexEvent) => void) | null = null
  const index = createIndex()
  const result: WorkspaceIndexResult = {
    index,
    generation: 1,
    complete: true,
    truncated: false,
  }
  return {
    load: vi.fn(async () => index),
    refresh: vi.fn(async () => result),
    cancel: vi.fn(),
    subscribe: vi.fn((_root, next) => {
      listener = next
      return () => { listener = null }
    }),
    dispose: vi.fn(),
    retain: vi.fn(),
    release: vi.fn(),
    getSearchSnapshot: vi.fn(() => null),
    emit: (event) => listener?.(event),
  }
}

describe('工作区索引 IPC', () => {
  const workspaceRootFor = vi.fn<(webContentsId: number) => string | null>()
  const isTrustedPath = vi.fn<(candidate: unknown) => boolean>()
  let service: ReturnType<typeof createService>

  beforeEach(() => {
    vi.mocked(ipcMain.handle).mockClear()
    workspaceRootFor.mockReset().mockReturnValue('D:/notes')
    isTrustedPath.mockReset().mockReturnValue(true)
    service = createService()
    registerWorkspaceIndexHandlers({ workspaceIndexService: service, workspaceRootFor, isTrustedPath })
  })

  it('使用当前窗口已登记且受信任的工作区根加载索引', async () => {
    const event = { sender: { id: 7, send: vi.fn() } }

    await expect(getHandler(CHANNELS.WORKSPACE_INDEX_LOAD)(event)).resolves.toEqual({
      ok: true,
      data: createIndex(),
    })
    expect(service.load).toHaveBeenCalledWith('D:/notes')
  })

  it('没有当前窗口工作区时拒绝刷新，不调用索引服务', async () => {
    workspaceRootFor.mockReturnValue(null)

    await expect(getHandler(CHANNELS.WORKSPACE_INDEX_REFRESH)({ sender: { id: 7, send: vi.fn() } })).resolves.toEqual({
      ok: false,
      error: { code: 'NO_WORKSPACE' },
    })
    expect(service.refresh).not.toHaveBeenCalled()
  })

  it('未受信任的当前窗口工作区时拒绝取消，不调用索引服务', async () => {
    isTrustedPath.mockReturnValue(false)

    await expect(getHandler(CHANNELS.WORKSPACE_INDEX_CANCEL)({ sender: { id: 7, send: vi.fn() } })).resolves.toEqual({
      ok: false,
      error: { code: 'INVALID_PATH' },
    })
    expect(service.cancel).not.toHaveBeenCalled()
  })

  it('请求根不属于当前窗口工作区时拒绝加载', async () => {
    await expect(getHandler(CHANNELS.WORKSPACE_INDEX_LOAD)(
      { sender: { id: 7, send: vi.fn() } },
      { root: 'D:/other' },
    )).resolves.toEqual({ ok: false, error: { code: 'INVALID_PATH' } })
    expect(service.load).not.toHaveBeenCalled()
  })

  it('刷新时将服务事件仅转发给登记该工作区的窗口', async () => {
    const event = { sender: { id: 7, send: vi.fn() } }
    await getHandler(CHANNELS.WORKSPACE_INDEX_REFRESH)(event)
    const update: WorkspaceIndexEvent = { type: 'updated', index: createIndex() }

    service.emit(update)

    expect(event.sender.send).toHaveBeenCalledWith(CHANNELS.WORKSPACE_INDEX_EVENT, update)
  })

  it('窗口切换工作区后重新订阅新根并取消旧根订阅', async () => {
    const subscriptions = new Map<string, (event: WorkspaceIndexEvent) => void>()
    const unsubscribe = vi.fn()
    service.subscribe = vi.fn((root, listener) => {
      subscriptions.set(root, listener)
      return () => {
        unsubscribe(root)
        subscriptions.delete(root)
      }
    })
    const event = { sender: { id: 7, send: vi.fn() } }
    await getHandler(CHANNELS.WORKSPACE_INDEX_LOAD)(event)
    workspaceRootFor.mockReturnValue('D:/other')
    await getHandler(CHANNELS.WORKSPACE_INDEX_REFRESH)(event)

    expect(unsubscribe).toHaveBeenCalledWith('D:/notes')
    expect(service.subscribe).toHaveBeenLastCalledWith('D:/other', expect.any(Function))
    subscriptions.get('D:/notes')?.({ type: 'updated', index: createIndex() })
    expect(event.sender.send).not.toHaveBeenCalledWith(CHANNELS.WORKSPACE_INDEX_EVENT, expect.anything())
  })
})
