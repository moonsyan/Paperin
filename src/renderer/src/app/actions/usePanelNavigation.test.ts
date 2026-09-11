// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePanelNavigation } from './usePanelNavigation'

const makeOptions = (overrides: Partial<Parameters<typeof usePanelNavigation>[0]> = {}) => {
  const base: Parameters<typeof usePanelNavigation>[0] = {
    setSidebarCollapsed: vi.fn(),
    setContextDockState: vi.fn(),
    setFocusOutlineTick: vi.fn(),
    setSearchMode: vi.fn(),
    setSearchPref: vi.fn(),
    setSearchEpoch: vi.fn(),
    handleSelectWorkspaceFile: vi.fn(async () => true),
    activeFilePath: '/tmp/ws/a.md',
    setVersionHistoryOpen: vi.fn(),
    setToast: vi.fn(),
  }
  return { ...base, ...overrides }
}

describe('usePanelNavigation', () => {
  it('openOutlinePanel 展开侧栏 + 切大纲 + 延迟一拍触发定位 tick', () => {
    vi.useFakeTimers()
    try {
      const setSidebarCollapsed = vi.fn()
      const setContextDockState = vi.fn()
      const setFocusOutlineTick = vi.fn()
      const { result } = renderHook(() =>
        usePanelNavigation(makeOptions({ setSidebarCollapsed, setContextDockState, setFocusOutlineTick })),
      )
      act(() => {
        result.current.openOutlinePanel()
      })
      expect(setSidebarCollapsed).toHaveBeenCalledWith(false)
      expect(setContextDockState).toHaveBeenCalled()
      // tick 必须延迟到下一个宏任务，避免侧栏重挂载时把 tick 当作已消费
      expect(setFocusOutlineTick).not.toHaveBeenCalled()
      act(() => {
        vi.runAllTimers()
      })
      expect(setFocusOutlineTick).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('handleOpenVersionHistory：无磁盘路径时 Toast 提示且不打开弹窗', () => {
    const setVersionHistoryOpen = vi.fn()
    const setToast = vi.fn()
    const { result } = renderHook(() =>
      usePanelNavigation(makeOptions({ activeFilePath: undefined, setVersionHistoryOpen, setToast })),
    )
    act(() => {
      result.current.handleOpenVersionHistory()
    })
    expect(setVersionHistoryOpen).not.toHaveBeenCalled()
    expect(setToast).toHaveBeenCalledWith('当前文档尚未保存到磁盘，暂无版本历史')
  })

  it('handleOpenVersionHistory：有磁盘路径时打开弹窗', () => {
    const setVersionHistoryOpen = vi.fn()
    const { result } = renderHook(() => usePanelNavigation(makeOptions({ setVersionHistoryOpen })))
    act(() => {
      result.current.handleOpenVersionHistory()
    })
    expect(setVersionHistoryOpen).toHaveBeenCalledWith(true)
  })

  it('handleOpenBacklink：并发点击只保留最后一次的搜索定位', async () => {
    // 第一次点击的 selectWorkspaceFile 迟迟不返回，第二次点击立刻返回。
    // 第一次返回时 seq 已经落后，不应再触发 setSearchPref/setSearchEpoch/setSearchMode
    let resolveFirst: (value: boolean) => void = () => {}
    const firstPromise = new Promise<boolean>((resolve) => {
      resolveFirst = resolve
    })
    const handleSelectWorkspaceFile = vi
      .fn()
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(true)
    const setSearchPref = vi.fn()
    const setSearchEpoch = vi.fn()
    const setSearchMode = vi.fn()

    const { result } = renderHook(() =>
      usePanelNavigation(
        makeOptions({ handleSelectWorkspaceFile, setSearchPref, setSearchEpoch, setSearchMode }),
      ),
    )

    act(() => {
      result.current.handleOpenBacklink('/tmp/a.md', 'first-query')
      result.current.handleOpenBacklink('/tmp/b.md', 'second-query')
    })

    // 第二次先返回：应该触发一次搜索定位
    await act(async () => {
      await Promise.resolve()
    })
    expect(setSearchPref).toHaveBeenCalledTimes(1)
    expect(setSearchMode).toHaveBeenCalledWith('find')

    // 第一次迟到返回：seq 已过期，不应再触发
    await act(async () => {
      resolveFirst(true)
      await firstPromise
    })
    expect(setSearchPref).toHaveBeenCalledTimes(1)
    expect(setSearchEpoch).toHaveBeenCalledTimes(1)
  })

  it('handleOpenBacklink：selectWorkspaceFile 返回 false 时不接力搜索', async () => {
    const handleSelectWorkspaceFile = vi.fn(async () => false)
    const setSearchPref = vi.fn()
    const { result } = renderHook(() =>
      usePanelNavigation(makeOptions({ handleSelectWorkspaceFile, setSearchPref })),
    )
    await act(async () => {
      result.current.handleOpenBacklink('/tmp/x.md', 'q')
      await Promise.resolve()
    })
    expect(setSearchPref).not.toHaveBeenCalled()
  })

  it('handleOpenBacklink：query 为空时只打开文件，不进入搜索模式', async () => {
    const setSearchMode = vi.fn()
    const setSearchPref = vi.fn()
    const { result } = renderHook(() =>
      usePanelNavigation(makeOptions({ setSearchMode, setSearchPref })),
    )
    await act(async () => {
      result.current.handleOpenBacklink('/tmp/x.md', '')
      await Promise.resolve()
    })
    expect(setSearchMode).not.toHaveBeenCalled()
    expect(setSearchPref).not.toHaveBeenCalled()
  })
})
