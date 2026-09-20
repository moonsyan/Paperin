// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkspaceFiles } from './useWorkspaceFiles'
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
      async () => ({ ok: true as const, data: { modifiedTime: 111, size: 1, contentSha256: 'd'.repeat(64) } }),
    ),
    flushEditorContent: vi.fn(),
    leaveCurrentDocument: vi.fn(async () => true),
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
  }
}

function renderOps(fx: Fixture) {
  return renderHook(() =>
    useWorkspaceFiles({
      workspace: { path: '/w', name: 'w', tree: [] },
      openFiles: [...fx.bridge.openFilesRef.current],
      savedMap: fx.savedMap,
      fileMtime: fx.fileMtime,
      bridge: fx.bridge,
      setToast: fx.setToast,
    }),
  ).result.current
}

function renderOpsWithRerender(fx: Fixture) {
  return renderHook(
    (props: { openFiles: OpenFile[]; savedMap: Record<string, boolean>; fileMtime: Record<string, number> }) =>
      useWorkspaceFiles({
        workspace: { path: '/w', name: 'w', tree: [] },
        openFiles: props.openFiles,
        savedMap: props.savedMap,
        fileMtime: props.fileMtime,
        bridge: fx.bridge,
        setToast: fx.setToast,
      }),
    {
      initialProps: {
        openFiles: [...fx.bridge.openFilesRef.current],
        savedMap: fx.savedMap,
        fileMtime: fx.fileMtime,
      },
    },
  )
}

describe('useWorkspaceFiles', () => {
  it('新建成功后刷新文件树并打开新文档', async () => {
    const fx = createFixture()
    const ops = renderOps(fx)
    await act(() => ops.handleCreateFile('/w'))
    expect(fx.ipcFns.createFile).toHaveBeenCalledWith('/w', '新文档.md')
    expect(fx.bridge.openFolder).toHaveBeenCalledWith('/w', true, true)
    expect(fx.bridge.openDocumentPath).toHaveBeenCalledWith('/w/new.md')
    expect(fx.setToast).not.toHaveBeenCalled()
  })

  it('新建同名冲突时提示且不刷新不打开', async () => {
    const fx = createFixture({ ipc: { createFile: { ok: false, error: { code: 'EXISTS' } } } })
    const ops = renderOps(fx)
    await act(() => ops.handleCreateFile('/w'))
    expect(fx.setToast).toHaveBeenCalledWith('同名文件已存在')
    expect(fx.bridge.openFolder).not.toHaveBeenCalled()
    expect(fx.bridge.openDocumentPath).not.toHaveBeenCalled()
  })

  it('重命名前保存冲突时中止且不调用改名 IPC', async () => {
    const fx = createFixture({ session: { saveWithEncodingFallback: vi.fn(SAVE_CONFLICT) } })
    const ops = renderOps(fx)
    await act(() => ops.handleRenameFile('/w/a.md', 'b.md'))
    expect(fx.setToast).toHaveBeenCalledWith(expect.stringContaining('已被外部修改，已中止重命名'))
    expect(fx.ipcFns.renameFile).not.toHaveBeenCalled()
  })

  it('活动文档快照未落账时中止重命名', async () => {
    const fx = createFixture({ session: { leaveCurrentDocument: vi.fn(async () => false) } })
    const ops = renderOps(fx)
    await act(async () => {
      await expect(ops.handleRenameFile('/w/a.md', 'r.md')).resolves.toBe(false)
    })
    expect(fx.ipcFns.renameFile).not.toHaveBeenCalled()
  })

  it('重命名成功后就地迁移标签记录、活动 id 与基线', async () => {
    const fx = createFixture()
    ;(fx.bridge.liveContentOf as ReturnType<typeof vi.fn>).mockReturnValue('最新内容')
    const ops = renderOps(fx)
    await act(() => ops.handleRenameFile('/w/a.md', 'r.md'))

    // 脏内容先写盘（interactive + 当前 mtime），基线随之写为实时内容
    expect(fx.bridge.saveWithEncodingFallback).toHaveBeenCalledWith(
      '/w/a.md',
      '最新内容',
      10,
      FILE_A.id,
      true,
    )
    expect(fx.bridge.initialOrSavedRef.current['file-/w/r.md']).toBe('最新内容')

    // 打开记录迁移到新路径；活动标签与标题跟随新 id
    const migrated = fx.bridge.openFilesRef.current.find((f) => f.path === '/w/r.md')
    expect(migrated?.id).toBe('file-/w/r.md')
    expect(migrated?.name).toBe('r.md')
    expect(fx.bridge.activeFileIdRef.current).toBe('file-/w/r.md')
    expect(fx.bridge.setActiveFileId).toHaveBeenCalledWith('file-/w/r.md')
    expect(fx.bridge.setDocTitle).toHaveBeenCalledWith('r.md')
    // 重命名前已写盘，旧路径草稿清理（含防抖待写项）
    expect(fx.bridge.clearDraft).toHaveBeenCalledWith(FILE_A.id)
    // 完成后刷新文件树
    expect(fx.bridge.openFolder).toHaveBeenCalledWith('/w', true, true)
  })

  it('删除未修改文件后移除记录并切到相邻标签', async () => {
    const fx = createFixture()
    fx.savedMap[FILE_A.id] = true
    fx.bridge.initialOrSavedRef.current[FILE_A.id] = 'A 内容'
    const ops = renderOps(fx)
    await act(() => ops.handleDeleteFile('/w/a.md'))
    expect(fx.ipcFns.deleteFile).toHaveBeenCalledWith('/w/a.md')
    expect(fx.bridge.openFilesRef.current.some((f) => f.id === FILE_A.id)).toBe(false)
    // 活动文件被删 → 切到相邻的 B
    expect(fx.bridge.switchFile).toHaveBeenCalledWith(FILE_B.id)
    expect(fx.bridge.clearDraft).toHaveBeenCalledWith(FILE_A.id)
  })

  it('删除前保存冲突时取消删除且不移除标签', async () => {
    const fx = createFixture({ session: { saveWithEncodingFallback: vi.fn(SAVE_CONFLICT) } })
    const ops = renderOps(fx)
    await act(() => ops.handleDeleteFile('/w/a.md'))
    expect(fx.setToast).toHaveBeenCalledWith(expect.stringContaining('已被外部修改，已取消删除'))
    expect(fx.ipcFns.deleteFile).not.toHaveBeenCalled()
    expect(fx.bridge.openFilesRef.current.some((f) => f.id === FILE_A.id)).toBe(true)
  })

  it('savedMap 仍为已保存时，重命名活动文件仍 flush 并写回实时内容', async () => {
    const fx = createFixture({
      savedMap: { [FILE_A.id]: true, [FILE_B.id]: true },
    })
    fx.bridge.initialOrSavedRef.current[FILE_A.id] = '磁盘旧内容'
    ;(fx.bridge.liveContentOf as ReturnType<typeof vi.fn>).mockReturnValue('防抖窗口内的输入')
    const ops = renderOps(fx)
    await act(() => ops.handleRenameFile('/w/a.md', 'r.md'))

    expect(fx.bridge.flushEditorContent).toHaveBeenCalled()
    expect(fx.bridge.saveWithEncodingFallback).toHaveBeenCalledWith(
      '/w/a.md',
      '防抖窗口内的输入',
      10,
      FILE_A.id,
      true,
    )
    expect(fx.ipcFns.renameFile).toHaveBeenCalled()
  })

  it('savedMap 仍为已保存时，删除活动文件仍 flush 并先写回再删除', async () => {
    const fx = createFixture({
      savedMap: { [FILE_A.id]: true, [FILE_B.id]: true },
    })
    fx.bridge.initialOrSavedRef.current[FILE_A.id] = '磁盘旧内容'
    ;(fx.bridge.liveContentOf as ReturnType<typeof vi.fn>).mockReturnValue('还没落账的输入')
    const ops = renderOps(fx)
    await act(() => ops.handleDeleteFile('/w/a.md'))

    expect(fx.bridge.flushEditorContent).toHaveBeenCalled()
    expect(fx.bridge.saveWithEncodingFallback).toHaveBeenCalledWith(
      '/w/a.md',
      '还没落账的输入',
      10,
      FILE_A.id,
      true,
    )
    expect(fx.ipcFns.deleteFile).toHaveBeenCalledWith('/w/a.md')
  })

  it('移动活动文件时先落账再迁移 id 并按新目录重渲染', async () => {
    const fx = createFixture()
    ;(fx.bridge.liveContentOf as ReturnType<typeof vi.fn>).mockReturnValue('移动前实时内容')
    const ops = renderOps(fx)
    await act(() => ops.handleMoveFile('/w/a.md', '/w/sub'))

    // 迁移前 flush 防抖输入，脏文件带冲突检测写盘
    expect(fx.bridge.flushEditorContent).toHaveBeenCalledOnce()
    expect(fx.bridge.saveWithEncodingFallback).toHaveBeenCalledWith(
      '/w/a.md',
      '移动前实时内容',
      10,
      FILE_A.id,
      true,
    )

    // 记录迁移到新子目录，活动 id 更新并重渲染编辑器内容
    const moved = fx.bridge.openFilesRef.current.find((f) => f.path === '/w/sub/a.md')
    expect(moved?.id).toBe('file-/w/sub/a.md')
    expect(fx.bridge.activeFileIdRef.current).toBe('file-/w/sub/a.md')
    expect(fx.bridge.replaceEditorContent).toHaveBeenCalledWith(
      'file-/w/sub/a.md',
      '移动前实时内容',
      'update',
    )
    expect(fx.setToast).toHaveBeenCalledWith('已移动')
    expect(fx.bridge.openFolder).toHaveBeenCalledWith('/w', true, true)
  })

  it('移动前脏文件保存失败时中止且不调用移动 IPC', async () => {
    const fx = createFixture({ session: { saveWithEncodingFallback: vi.fn(SAVE_CONFLICT) } })
    const ops = renderOps(fx)
    await act(() => ops.handleMoveFile('/w/a.md', '/w/sub'))
    expect(fx.setToast).toHaveBeenCalledWith(expect.stringContaining('已被外部修改，已中止移动'))
    expect(fx.ipcFns.moveFile).not.toHaveBeenCalled()
  })

  it('右键菜单在新窗口打开文件', () => {
    const fx = createFixture()
    const ops = renderOps(fx)
    ops.handleOpenInNewWindow('/w/b.md')
    expect(fx.ipcFns.newWindowWithFile).toHaveBeenCalledWith('/w/b.md')
  })

  it('重命名期间记录已被并发操作移走时：落账后仅清旧草稿并刷新，不迁移状态', async () => {
    const fx = createFixture()
    // 模拟连续操作竞态（A-L3）：重命名提交时按路径已找不到打开记录，
    // 但脏内容与回退 id 的草稿仍在，需要先写盘再走"无事可迁"分支
    fx.bridge.contentsRef.current['file-/w/gone.md'] = '幽灵内容'
    fx.savedMap['file-/w/gone.md'] = false
    const ops = renderOps(fx)
    await act(() => ops.handleRenameFile('/w/gone.md', 'r2.md'))

    // 脏内容按回退 id 写盘（fileMtime 缺失 → expectedMtime 为 undefined）
    expect(fx.bridge.saveWithEncodingFallback).toHaveBeenCalledWith(
      '/w/gone.md',
      '幽灵内容',
      undefined,
      'file-/w/gone.md',
      true,
    )
    expect(fx.ipcFns.renameFile).toHaveBeenCalledWith('/w/gone.md', 'r2.md')
    // 记录不存在：只清理旧路径草稿并刷新文件树
    expect(fx.bridge.clearDraft).toHaveBeenCalledWith('file-/w/gone.md')
    expect(fx.bridge.openFolder).toHaveBeenCalledWith('/w', true, true)
    // 不做任何记录迁移，活动标签不受影响
    expect(fx.bridge.setOpenFiles).not.toHaveBeenCalled()
    expect(fx.bridge.setContents).not.toHaveBeenCalled()
    expect(fx.bridge.setSavedMap).not.toHaveBeenCalled()
    expect(fx.bridge.activeFileIdRef.current).toBe(FILE_A.id)
  })

  it('移动文件夹时批量迁移多个子文件的 id、内容、基线与待写草稿', async () => {
    const FOLD_X: OpenFile = { id: 'file-/w/fold/x.md', name: 'x.md', path: '/w/fold/x.md' }
    const FOLD_Y: OpenFile = { id: 'file-/w/fold/y/deep.md', name: 'deep.md', path: '/w/fold/y/deep.md' }
    const contents = {
      [FOLD_X.id]: 'X 内容',
      [FOLD_Y.id]: 'Y 内容',
    }
    const fx = createFixture({
      session: {
        openFilesRef: { current: [FOLD_X, FOLD_Y] },
        contentsRef: { current: contents },
        activeFileIdRef: { current: FOLD_X.id },
        draftPendingRef: { current: { id: FOLD_X.id, content: '防抖待写' } },
        liveContentOf: vi.fn((id: string) => contents[id] ?? ''),
      },
      savedMap: { [FOLD_X.id]: false, [FOLD_Y.id]: false },
      fileMtime: { [FOLD_X.id]: 10, [FOLD_Y.id]: 20 },
      ipc: {
        moveFile: {
          ok: true,
          data: { path: '/w/moved', name: 'moved', modifiedTime: 999 },
        },
      },
    })
    const ops = renderOps(fx)
    await act(() => ops.handleMoveFile('/w/fold', '/w/moved'))

    // 活动文件在被移动子树内 → 迁移前 flush；两个脏子文件按序写盘落账
    expect(fx.bridge.flushEditorContent).toHaveBeenCalledOnce()
    expect(fx.bridge.saveWithEncodingFallback).toHaveBeenNthCalledWith(
      1, '/w/fold/x.md', 'X 内容', 10, FOLD_X.id, true,
    )
    expect(fx.bridge.saveWithEncodingFallback).toHaveBeenNthCalledWith(
      2, '/w/fold/y/deep.md', 'Y 内容', 20, FOLD_Y.id, true,
    )

    // 打开记录整体映射到新目录（含嵌套子文件）
    const migratedX = fx.bridge.openFilesRef.current.find((f) => f.path === '/w/moved/x.md')
    const migratedY = fx.bridge.openFilesRef.current.find((f) => f.path === '/w/moved/y/deep.md')
    expect(migratedX?.id).toBe('file-/w/moved/x.md')
    expect(migratedY?.id).toBe('file-/w/moved/y/deep.md')

    // contents 镜像同步迁移（旧键删除、新键保留原值）
    expect(fx.bridge.contentsRef.current['file-/w/moved/x.md']).toBe('X 内容')
    expect(fx.bridge.contentsRef.current['file-/w/moved/y/deep.md']).toBe('Y 内容')
    expect(fx.bridge.contentsRef.current[FOLD_X.id]).toBeUndefined()
    expect(fx.bridge.contentsRef.current[FOLD_Y.id]).toBeUndefined()

    // 基线随之迁移；活动文件重渲染编辑器内容
    expect(fx.bridge.initialOrSavedRef.current['file-/w/moved/x.md']).toBe('X 内容')
    expect(fx.bridge.activeFileIdRef.current).toBe('file-/w/moved/x.md')
    expect(fx.bridge.replaceEditorContent).toHaveBeenCalledWith(
      'file-/w/moved/x.md',
      'X 内容',
      'update',
    )
    // 防抖中的待写草稿迁移到新路径；旧路径持久化草稿清除
    expect(fx.bridge.draftPendingRef.current?.id).toBe('file-/w/moved/x.md')
    expect(fx.bridge.draftPendingRef.current?.content).toBe('防抖待写')
    expect(fx.bridge.clearDraft).toHaveBeenCalledWith(FOLD_X.id)
    expect(fx.bridge.clearDraft).toHaveBeenCalledWith(FOLD_Y.id)

    expect(fx.setToast).toHaveBeenCalledWith('已移动')
    expect(fx.bridge.openFolder).toHaveBeenCalledWith('/w', true, true)
  })

  describe('重渲染或 ref 更新后保存动作使用最新 mtime 与正文', () => {
    it('首渲染捕获的删除回调在 ref 更新后仍带最新 mtime 与内容写盘', async () => {
      const fx = createFixture({
        savedMap: { [FILE_A.id]: true, [FILE_B.id]: true },
        fileMtime: { [FILE_A.id]: 10, [FILE_B.id]: 20 },
      })
      fx.bridge.initialOrSavedRef.current[FILE_A.id] = '磁盘旧内容'
      fx.bridge.fileMtimeRef.current = { [FILE_A.id]: 10, [FILE_B.id]: 20 }
      const { result } = renderOpsWithRerender(fx)
      const deleteFromFirstRender = result.current.handleDeleteFile

      fx.bridge.contentsRef.current[FILE_A.id] = '重渲染后的正文'
      fx.bridge.initialOrSavedRef.current[FILE_A.id] = '磁盘旧内容'
      fx.bridge.fileMtimeRef.current[FILE_A.id] = 888
      ;(fx.bridge.liveContentOf as ReturnType<typeof vi.fn>).mockReturnValue('重渲染后的正文')

      await act(async () => {
        await deleteFromFirstRender('/w/a.md')
      })

      expect(fx.bridge.saveWithEncodingFallback).toHaveBeenCalledWith(
        '/w/a.md',
        '重渲染后的正文',
        888,
        FILE_A.id,
        true,
      )
      expect(fx.ipcFns.deleteFile).toHaveBeenCalledWith('/w/a.md')
    })

    it('重渲染后重命名使用 ref 中最新的 mtime，而非过期的 fileMtime prop', async () => {
      const fx = createFixture({
        savedMap: { [FILE_A.id]: false, [FILE_B.id]: true },
        fileMtime: { [FILE_A.id]: 10, [FILE_B.id]: 20 },
      })
      fx.bridge.initialOrSavedRef.current[FILE_A.id] = ''
      fx.bridge.contentsRef.current[FILE_A.id] = '过期闭包不应写这个'
      const { result, rerender } = renderOpsWithRerender(fx)

      fx.bridge.contentsRef.current[FILE_A.id] = '重渲染后应保存的正文'
      fx.bridge.fileMtimeRef.current[FILE_A.id] = 555
      ;(fx.bridge.liveContentOf as ReturnType<typeof vi.fn>).mockReturnValue('重渲染后应保存的正文')

      rerender({
        openFiles: [...fx.bridge.openFilesRef.current],
        savedMap: { [FILE_A.id]: false, [FILE_B.id]: true },
        fileMtime: { [FILE_A.id]: 10, [FILE_B.id]: 20 },
      })

      await act(async () => {
        await result.current.handleRenameFile('/w/a.md', 'r.md')
      })

      expect(fx.bridge.saveWithEncodingFallback).toHaveBeenCalledWith(
        '/w/a.md',
        '重渲染后应保存的正文',
        555,
        FILE_A.id,
        true,
      )
    })

    it('首渲染捕获的重命名回调不会用过期正文写盘', async () => {
      const fx = createFixture({
        savedMap: { [FILE_A.id]: false, [FILE_B.id]: true },
        fileMtime: { [FILE_A.id]: 10, [FILE_B.id]: 20 },
      })
      fx.bridge.initialOrSavedRef.current[FILE_A.id] = '首渲染基线'
      fx.bridge.contentsRef.current[FILE_A.id] = '首渲染正文'
      ;(fx.bridge.liveContentOf as ReturnType<typeof vi.fn>).mockReturnValue('首渲染正文')
      const { result } = renderOpsWithRerender(fx)
      const renameFromFirstRender = result.current.handleRenameFile

      fx.bridge.contentsRef.current[FILE_A.id] = '用户继续输入后的正文'
      fx.bridge.initialOrSavedRef.current[FILE_A.id] = '首渲染基线'
      fx.bridge.fileMtimeRef.current[FILE_A.id] = 999
      ;(fx.bridge.liveContentOf as ReturnType<typeof vi.fn>).mockReturnValue('用户继续输入后的正文')

      await act(async () => {
        await renameFromFirstRender('/w/a.md', 'r.md')
      })

      expect(fx.bridge.saveWithEncodingFallback).toHaveBeenCalledWith(
        '/w/a.md',
        '用户继续输入后的正文',
        999,
        FILE_A.id,
        true,
      )
      expect(fx.bridge.saveWithEncodingFallback).not.toHaveBeenCalledWith(
        '/w/a.md',
        '首渲染正文',
        expect.anything(),
        FILE_A.id,
        true,
      )
    })
  })

  describe('编码降级确认被取消（ENCODING_LOSS 上抛）时中止且不调用对应 IPC', () => {
    // interactive=true 的 GBK 降级确认发生在文档会话内部（window.confirm）；
    // 此处模拟用户在确认框选择"否"后 saveWithEncodingFallback 上抛的最终结果
    const LOSS = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'ENCODING_LOSS' as const, message: '内容包含 GBK 无法表示的字符' },
    }))

    it('重命名中止', async () => {
      const fx = createFixture({ session: { saveWithEncodingFallback: vi.fn(LOSS) } })
      const ops = renderOps(fx)
      await act(() => ops.handleRenameFile('/w/a.md', 'b.md'))
      expect(fx.setToast).toHaveBeenCalledWith('重命名前保存失败，已中止')
      expect(fx.ipcFns.renameFile).not.toHaveBeenCalled()
      expect(fx.bridge.openFilesRef.current.some((f) => f.path === '/w/a.md')).toBe(true)
    })

    it('删除取消', async () => {
      const fx = createFixture({ session: { saveWithEncodingFallback: vi.fn(LOSS) } })
      const ops = renderOps(fx)
      await act(() => ops.handleDeleteFile('/w/a.md'))
      expect(fx.setToast).toHaveBeenCalledWith('删除前保存失败，已取消删除')
      expect(fx.ipcFns.deleteFile).not.toHaveBeenCalled()
      expect(fx.bridge.openFilesRef.current.some((f) => f.id === FILE_A.id)).toBe(true)
    })

    it('移动中止', async () => {
      const fx = createFixture({ session: { saveWithEncodingFallback: vi.fn(LOSS) } })
      const ops = renderOps(fx)
      await act(() => ops.handleMoveFile('/w/a.md', '/w/sub'))
      expect(fx.setToast).toHaveBeenCalledWith('移动前保存失败，已中止')
      expect(fx.ipcFns.moveFile).not.toHaveBeenCalled()
      expect(fx.bridge.replaceEditorContent).not.toHaveBeenCalled()
    })
  })
})
