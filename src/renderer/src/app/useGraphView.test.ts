/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useGraphView } from './useGraphView'
import type { WorkspaceInfo } from '../components/Sidebar'

const workspaceAt = (path: string): WorkspaceInfo => ({ path, name: path, tree: [] })

const createOptions = (workspace: WorkspaceInfo | null) => ({
  workspace,
  refreshLinks: vi.fn(),
  setToast: vi.fn(),
})

describe('useGraphView', () => {
  it('未打开工作区时只提示，不创建图谱标签', () => {
    const options = createOptions(null)
    const { result } = renderHook(() => useGraphView(options))

    act(() => result.current.openGraphView())

    expect(options.setToast).toHaveBeenCalledWith('请先打开文件夹（工作区）后再查看知识图谱')
    expect(options.refreshLinks).not.toHaveBeenCalled()
    expect(result.current.graphTabOpen).toBe(false)
    expect(result.current.graphTabActive).toBe(false)
  })

  it('用户主动打开时先刷新链接再打开并激活标签', () => {
    const options = createOptions(workspaceAt('/ws'))
    const { result } = renderHook(() => useGraphView(options))
    // 自动打开不刷新链接，先清空以便断言主动打开的行为
    options.refreshLinks.mockClear()

    act(() => result.current.closeGraphView())
    act(() => result.current.openGraphView())

    expect(options.refreshLinks).toHaveBeenCalledOnce()
    expect(result.current.graphTabOpen).toBe(true)
    expect(result.current.graphTabActive).toBe(true)
  })

  it('打开工作区即自动展示图谱，同一路径不重复触发', () => {
    const options = createOptions(workspaceAt('/ws'))
    const { result, rerender } = renderHook(() => useGraphView(options))

    expect(result.current.graphTabOpen).toBe(true)
    expect(result.current.graphTabActive).toBe(true)

    act(() => result.current.setGraphTabActive(false))
    rerender()

    expect(result.current.graphTabActive).toBe(false)
    expect(result.current.graphTabOpen).toBe(true)
  })

  it('切换到另一个工作区重新自动展示图谱', () => {
    const options = createOptions(workspaceAt('/ws-a'))
    const { result, rerender } = renderHook(({ workspace }) => useGraphView({ ...options, workspace }), {
      initialProps: { workspace: workspaceAt('/ws-a') as WorkspaceInfo | null },
    })

    act(() => result.current.closeGraphView())
    expect(result.current.graphTabOpen).toBe(false)

    rerender({ workspace: workspaceAt('/ws-b') })

    expect(result.current.graphTabOpen).toBe(true)
    expect(result.current.graphTabActive).toBe(true)
  })

  it('切回文档标签时保留图谱标签，只取消激活', () => {
    const options = createOptions(workspaceAt('/ws'))
    const { result } = renderHook(() => useGraphView(options))

    act(() => result.current.setGraphTabActive(false))

    expect(result.current.graphTabActive).toBe(false)
    expect(result.current.graphTabOpen).toBe(true)
  })

  it('关闭图谱标签同时取消激活', () => {
    const options = createOptions(workspaceAt('/ws'))
    const { result } = renderHook(() => useGraphView(options))

    act(() => result.current.closeGraphView())

    expect(result.current.graphTabOpen).toBe(false)
    expect(result.current.graphTabActive).toBe(false)
  })
})
