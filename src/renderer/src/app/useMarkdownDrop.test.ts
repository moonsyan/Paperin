// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useMarkdownDrop } from './useMarkdownDrop'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

interface DropFileStub { name: string; path?: string }

/** 构造拖放事件替身（真实 DataTransfer 无法直接构造；File 需带 path 才被识别为系统拖拽） */
const createDragEvent = (types: string[], files: DropFileStub[] = []) => ({
  dataTransfer: { types, files },
  preventDefault: vi.fn(),
}) as unknown as React.DragEvent<HTMLElement>

const stubDesktopAPI = (readDropped: (file: DropFileStub) => Promise<unknown>) => {
  Object.defineProperty(window, 'desktopAPI', {
    value: { document: { readDropped } },
    configurable: true,
    writable: true,
  })
}

const flush = async () => { await act(async () => { await Promise.resolve() }) }

describe('useMarkdownDrop', () => {
  it('仅对携带 Files 类型的拖拽阻止默认行为', () => {
    const { result } = renderHook(() => useMarkdownDrop({ onOpenFile: vi.fn(), notify: vi.fn() }))

    const noFiles = createDragEvent([])
    act(() => result.current.onDragOver(noFiles))
    expect(noFiles.preventDefault).not.toHaveBeenCalled()

    const withFiles = createDragEvent(['Files'])
    act(() => result.current.onDragOver(withFiles))
    expect(withFiles.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('落下后读取并打开拖入的 Markdown 文件', async () => {
    const readDropped = vi.fn(async () => ({ ok: true, data: { path: '/ws/a.md' } }))
    stubDesktopAPI(readDropped)
    const onOpenFile = vi.fn()
    const { result } = renderHook(() => useMarkdownDrop({ onOpenFile, notify: vi.fn() }))

    act(() => result.current.onDrop(createDragEvent(['Files'], [{ name: 'a.md', path: '/ws/a.md' }])))
    await flush()

    expect(readDropped).toHaveBeenCalledTimes(1)
    expect(onOpenFile).toHaveBeenCalledWith('/ws/a.md')
  })

  it('非 Markdown 文件不进入读取流程', async () => {
    const readDropped = vi.fn(async () => ({ ok: true, data: { path: '/ws/a.png' } }))
    stubDesktopAPI(readDropped)
    const { result } = renderHook(() => useMarkdownDrop({ onOpenFile: vi.fn(), notify: vi.fn() }))

    act(() => result.current.onDrop(createDragEvent(['Files'], [{ name: 'a.png', path: '/ws/a.png' }])))
    await flush()

    expect(readDropped).not.toHaveBeenCalled()
  })

  it('超大文件给出明确提示，读取失败给出通用提示，非法路径静默跳过', async () => {
    const notify = vi.fn()
    const { result } = renderHook(() => useMarkdownDrop({ onOpenFile: vi.fn(), notify }))
    const drop = () => act(() => result.current.onDrop(createDragEvent(['Files'], [{ name: 'a.md', path: '/ws/a.md' }])))

    stubDesktopAPI(async () => ({ ok: false, error: { code: 'TOO_LARGE', message: '文件过大' } }))
    drop()
    await flush()
    expect(notify).toHaveBeenCalledWith('文件过大')

    notify.mockClear()
    stubDesktopAPI(async () => ({ ok: false, error: { code: 'READ_FAILED' } }))
    drop()
    await flush()
    expect(notify).toHaveBeenCalledWith('拖入文件读取失败')

    notify.mockClear()
    stubDesktopAPI(async () => ({ ok: false, error: { code: 'INVALID_PATH' } }))
    drop()
    await flush()
    expect(notify).not.toHaveBeenCalled()
  })
})
