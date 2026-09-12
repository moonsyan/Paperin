// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePanelNavigation } from './usePanelNavigation'

const makeOptions = (overrides: Partial<Parameters<typeof usePanelNavigation>[0]> = {}) => {
  const base: Parameters<typeof usePanelNavigation>[0] = {
    setSidebarCollapsed: vi.fn(),
    setContextDockState: vi.fn(),
    setFocusOutlineTick: vi.fn(),
    reveal: vi.fn(async () => true),
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

  it('handleOpenBacklink：带 query 时交给视图模型打开查找栏并强制非正则', () => {
    const reveal = vi.fn(async () => true)
    const { result } = renderHook(() => usePanelNavigation(makeOptions({ reveal })))
    act(() => {
      result.current.handleOpenBacklink('/tmp/a.md', 'q')
    })
    expect(reveal).toHaveBeenCalledWith({
      path: '/tmp/a.md',
      search: { query: 'q', useRegex: false, openFindBar: true },
    })
  })

  it('handleOpenBacklink：query 为空时只打开文件，不接力搜索', () => {
    const reveal = vi.fn(async () => true)
    const { result } = renderHook(() => usePanelNavigation(makeOptions({ reveal })))
    act(() => {
      result.current.handleOpenBacklink('/tmp/x.md', '')
    })
    expect(reveal).toHaveBeenCalledWith({ path: '/tmp/x.md' })
  })
})
