// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkspaceController } from './useWorkspaceController'
import type { DocumentWorkspaceBridge } from './types'
import type { OpenFile } from '../../components/Sidebar'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const FILE_A: OpenFile = { id: 'file-/w/a.md', name: 'a.md', path: '/w/a.md' }
const FILE_B: OpenFile = { id: 'file-/w/b.md', name: 'b.md', path: '/w/b.md' }

const SAVE_CONFLICT = async () =>
  ({ ok: false as const, error: { code: 'CONFLICT', message: '外部修改' } })

interface Overrides {
  /** 桥接成员替换（会话能力侧） */
  session?: Partial<DocumentWorkspaceBridge>
  /** 主进程 IPC 返回值替换（工作区文件操作侧） */
  ipc?: {
    createFile?: unknown
    renameFile?: unknown
    deleteFile?: unknown
    moveFile?: unknown
  }
  savedMap?: Record<string, boolean>
  fileMtime?: Record<string, number>
}

interface Fixture extends Overrides {
  bridge: DocumentWorkspaceBridge & Record<string, ReturnType<typeof vi.fn>>
  savedMap: Record<string, boolean>
  fileMtime: Record<string, number>
  setToast: ReturnType<typeof vi.fn>
  ipcFns: Record<string, ReturnType<typeof vi.fn>>
  closeAllTabs: ReturnType<typeof vi.fn>
}

function createFixture(overrides: Overrides = {}): Fixture {
  const openFilesRef = { current: [FILE_A, FILE_B] }
  const contentsRef = { current: { [FILE_A.id]: 'A 内容', [FILE_B.id]: 'B 内容' } }
  const initialOrSavedRef = { current: { [FILE_A.id]: '', [FILE_B.id]: '' } }
  const draftPendingRef = { current: null as { id: string; content: string } | null }
  const setToast = vi.fn()

  const ipcCreateFile =
    vi.fn(async () => ({ ok: true, data: { path: '/w/new.md', name: 'new.md' } }))
  const ipcRenameFile =
    vi.fn(async () => ({ ok: true, data: { path: '/w/r.md', name: 'r.md', modifiedTime: 222 } }))
  const ipcDeleteFile = vi.fn(async () => ({ ok: true, data: undefined }))
  const ipcMoveFile = vi.fn(async () => ({
    ok: true,
    data: { path: '/w/sub/a.md', name: 'a.md', modifiedTime: 333 },
  }))
  const ipcNewWindow = vi.fn()

  if (overrides.ipc) {
    const entries: [unknown, ReturnType<typeof vi.fn>][] = [
      [overrides.ipc.createFile, ipcCreateFile],
      [overrides.ipc.renameFile, ipcRenameFile],
      [overrides.ipc.deleteFile, ipcDeleteFile],
      [overrides.ipc.moveFile, ipcMoveFile],
    ]
    for (const [payload, mockFn] of entries) {
      if (payload !== undefined) mockFn.mockImplementation(async () => payload)
    }
  }

  const bridge = {
    openDocumentPath: vi.fn(async () => true),
    openFolder: vi.fn(async () => {}),
    liveContentOf: vi.fn((id: string) => contentsRef.current[id] ?? ''),
    saveWithEncodingFallback: vi.fn(
      async () => ({ ok: true as const, data: { modifiedTime: 111 } }),
    ),
    flushEditorContent: vi.fn(),
    replaceEditorContent: vi.fn(),
    switchFile: vi.fn(),
    clearDraft: vi.fn(async () => {}),
    openFilesRef,
    contentsRef,
    activeFileIdRef: { current: FILE_A.id },
    fileMtimeRef: { current: overrides.fileMtime ?? { [FILE_A.id]: 10, [FILE_B.id]: 20 } },
    initialOrSavedRef,
    draftPendingRef,
    setOpenFiles: vi.fn(),
    setContents: vi.fn(),
    setSavedMap: vi.fn(),
    setFileMtime: vi.fn(),
    setEncodingMap: vi.fn(),
    setActiveFileId: vi.fn(),
    setDocTitle: vi.fn(),
    ...overrides.session,
  } as unknown as DocumentWorkspaceBridge & Record<string, ReturnType<typeof vi.fn>>

  const ipcFns = {
    createFile: ipcCreateFile,
    renameFile: ipcRenameFile,
    deleteFile: ipcDeleteFile,
    moveFile: ipcMoveFile,
    newWindowWithFile: ipcNewWindow,
  }

  vi.stubGlobal('desktopAPI', {
    platform: 'win32',
    workspace: {
      createFile: ipcCreateFile,
      renameFile: ipcRenameFile,
      deleteFile: ipcDeleteFile,
      moveFile: ipcMoveFile,
    },
    window: { newWindowWithFile: ipcNewWindow },
  })

  return {
    ...overrides,
    bridge,
    savedMap: overrides.savedMap ?? { [FILE_A.id]: false, [FILE_B.id]: true },
    fileMtime: overrides.fileMtime ?? { [FILE_A.id]: 10, [FILE_B.id]: 20 },
    setToast,
    ipcFns,
    closeAllTabs: vi.fn(),
  }
}

function renderController(fx: Fixture) {
  return renderHook(() =>
    useWorkspaceController({
      workspace: { path: '/w', name: 'w', tree: [] },
      openFiles: [...fx.bridge.openFilesRef.current],
      savedMap: fx.savedMap,
      fileMtime: fx.fileMtime,
      bridge: fx.bridge,
      setToast: fx.setToast,
      closeAllTabs: fx.closeAllTabs,
    }),
  ).result.current
}

describe('useWorkspaceController', () => {
  it('open 无路径时委托会话打开目录选择；有路径时直接打开目标目录', async () => {
    const fx = createFixture()
    const controller = renderController(fx)
    await act(async () => {
      await controller.open()
    })
    expect(fx.bridge.openFolder).toHaveBeenCalledWith(undefined, false, false)

    await act(async () => {
      await controller.open('/w/other')
    })
    expect(fx.bridge.openFolder).toHaveBeenCalledWith('/w/other', false, false)
  })

  it('新建文件：默认名与显式名都透传 IPC，成功返回 true', async () => {
    const fx = createFixture()
    let controller = renderController(fx)
    await act(async () => {
      await expect(controller.createFile('/w')).resolves.toBe(true)
    })
    expect(fx.ipcFns.createFile).toHaveBeenCalledWith('/w', '新文档.md')
    // 慢读取竞态由会话层守卫（latestWorkspaceSelection）承接：controller
    // 只保证 open 走同一 openDocumentPath 通道，连续选择不产生重复标签
    expect(fx.bridge.openDocumentPath).toHaveBeenCalledWith('/w/new.md')

    controller = renderController(fx)
    await act(async () => {
      await expect(controller.createFile('/w', '自定义.md')).resolves.toBe(true)
    })
    expect(fx.ipcFns.createFile).toHaveBeenCalledWith('/w', '自定义.md')
  })

  it('重命名打开文件后迁移打开记录的 id/name/path 并返回 true', async () => {
    const fx = createFixture()
    ;(fx.bridge.liveContentOf as ReturnType<typeof vi.fn>).mockReturnValue('最新内容')
    const controller = renderController(fx)
    await act(async () => {
      await expect(controller.renameFile('/w/a.md', 'r.md')).resolves.toBe(true)
    })
    const migrated = fx.bridge.openFilesRef.current.find((f) => f.path === '/w/r.md')
    expect(migrated?.id).toBe('file-/w/r.md')
    expect(migrated?.name).toBe('r.md')
    expect(migrated?.path).toBe('/w/r.md')
    expect(fx.bridge.activeFileIdRef.current).toBe('file-/w/r.md')
  })

  it('移动文件夹时批量迁移子文档记录到新目录', async () => {
    const FOLD_X: OpenFile = { id: 'file-/w/fold/x.md', name: 'x.md', path: '/w/fold/x.md' }
    const FOLD_Y: OpenFile = {
      id: 'file-/w/fold/y/deep.md',
      name: 'deep.md',
      path: '/w/fold/y/deep.md',
    }
    const contents = { [FOLD_X.id]: 'X 内容', [FOLD_Y.id]: 'Y 内容' }
    const fx = createFixture({
      session: {
        openFilesRef: { current: [FOLD_X, FOLD_Y] },
        contentsRef: { current: contents },
        activeFileIdRef: { current: FOLD_X.id },
        liveContentOf: vi.fn((id: string) => contents[id] ?? ''),
      },
      savedMap: { [FOLD_X.id]: true, [FOLD_Y.id]: true },
      fileMtime: { [FOLD_X.id]: 10, [FOLD_Y.id]: 20 },
      ipc: { moveFile: { ok: true, data: { path: '/w/moved', name: 'moved', modifiedTime: 999 } } },
    })
    const controller = renderController(fx)
    await act(async () => {
      await expect(controller.moveFile('/w/fold', '/w/moved')).resolves.toBe(true)
    })
    const movedX = fx.bridge.openFilesRef.current.find((f) => f.path === '/w/moved/x.md')
    const movedY = fx.bridge.openFilesRef.current.find((f) => f.path === '/w/moved/y/deep.md')
    expect(movedX?.id).toBe('file-/w/moved/x.md')
    expect(movedY?.id).toBe('file-/w/moved/y/deep.md')
    // 内容镜像同步迁移，旧键删除
    expect(fx.bridge.contentsRef.current['file-/w/moved/x.md']).toBe('X 内容')
    expect(fx.bridge.contentsRef.current[FOLD_X.id]).toBeUndefined()
  })

  it('删除前保存冲突时返回 false 且标签与内容保留', async () => {
    const fx = createFixture({ session: { saveWithEncodingFallback: vi.fn(SAVE_CONFLICT) } })
    const controller = renderController(fx)
    await act(async () => {
      await expect(controller.deleteFile('/w/a.md')).resolves.toBe(false)
    })
    expect(fx.ipcFns.deleteFile).not.toHaveBeenCalled()
    const recordA = fx.bridge.openFilesRef.current.find((f) => f.id === FILE_A.id)
    expect(recordA).toBeDefined()
    expect(fx.bridge.contentsRef.current[FILE_A.id]).toBe('A 内容')
  })

  it('IPC 删除失败时同样返回 false 且标签保留', async () => {
    const fx = createFixture({
      ipc: { deleteFile: { ok: false, error: { code: 'IO_ERROR' } } },
      savedMap: { [FILE_A.id]: true, [FILE_B.id]: true },
    })
    const controller = renderController(fx)
    await act(async () => {
      await expect(controller.deleteFile('/w/a.md')).resolves.toBe(false)
    })
    const recordA = fx.bridge.openFilesRef.current.find((f) => f.id === FILE_A.id)
    expect(recordA).toBeDefined()
    expect(fx.bridge.contentsRef.current[FILE_A.id]).toBe('A 内容')
  })

  it('close 通过关全部标签编排落账（沿用既有关闭确认流）', async () => {
    const fx = createFixture()
    const controller = renderController(fx)
    await act(async () => {
      controller.close()
    })
    expect(fx.closeAllTabs).toHaveBeenCalledOnce()
  })

  it('refresh 刷新工作区文件树', async () => {
    const fx = createFixture()
    const controller = renderController(fx)
    await act(async () => {
      await controller.refresh()
    })
    expect(fx.bridge.openFolder).toHaveBeenCalledWith('/w', true, true)
  })
})
