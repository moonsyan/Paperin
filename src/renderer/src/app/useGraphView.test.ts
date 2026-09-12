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

  it('闸门 ref 为 false 时 auto-open 只出现标签不激活，消费一次后复位', () => {
    const gate = { current: false }
    const options = createOptions(workspaceAt('/ws'))
    const { result, rerender } = renderHook(
      ({ workspace }) => useGraphView({ ...options, workspace, autoOpenActivateRef: gate }),
      { initialProps: { workspace: workspaceAt('/ws') as WorkspaceInfo | null } },
    )

    // 会话恢复场景：图谱标签出现，但不盖住恢复的文档
    expect(result.current.graphTabOpen).toBe(true)
    expect(result.current.graphTabActive).toBe(false)
    // 消费一次即复位，下一次打开其他工作区恢复默认激活行为
    expect(gate.current).toBe(true)

    act(() => result.current.closeGraphView())
    rerender({ workspace: workspaceAt('/ws-b') })

    expect(result.current.graphTabOpen).toBe(true)
    expect(result.current.graphTabActive).toBe(true)
  })

  it('未传闸门 ref 时保持打开工作区即激活的既有行为', () => {
    const options = createOptions(workspaceAt('/ws'))
    const { result } = renderHook(() => useGraphView(options))

    expect(result.current.graphTabOpen).toBe(true)
    expect(result.current.graphTabActive).toBe(true)
  })
})
