// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, act } from '@testing-library/react'
import { useWorkspaceDrawers } from './useWorkspaceDrawers'
import { DEFAULT_CONTEXT_DOCK_STATE } from '../components/ContextDock/context-dock-state'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type MediaListener = (event: { matches: boolean }) => void

/** jsdom 无 matchMedia：stub 可控断点，返回监听器集合用于模拟跨断点 */
function stubMatchMedia(initialNarrow: boolean): Map<MediaQueryList, Set<MediaListener>> {
  const listeners = new Map<MediaQueryList, Set<MediaListener>>()
  const query = { matches: initialNarrow, media: '(max-width: 820px)' } as MediaQueryList
  const mql = vi.fn((q: string) => {
    const list = { ...query, media: q, addEventListener: (_: string, cb: MediaListener) => {
      if (!listeners.has(list as unknown as MediaQueryList)) listeners.set(list as unknown as MediaQueryList, new Set())
      listeners.get(list as unknown as MediaQueryList)!.add(cb)
    }, removeEventListener: () => {} } as unknown as MediaQueryList
    return list
  })
  vi.stubGlobal('matchMedia', mql)
  return listeners
}

const baseOptions = {
  sidebarCollapsed: false,
  dockVisibility: DEFAULT_CONTEXT_DOCK_STATE.visibility,
  onSidebarCollapsedChange: vi.fn(),
}

describe('useWorkspaceDrawers（窄窗口抽屉协调）', () => {
  it('宽窗口：可见性直接来自持久化偏好，无遮罩', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useWorkspaceDrawers(baseOptions))
    expect(result.current.isNarrow).toBe(false)
    expect(result.current.sidebarVisible).toBe(true)
    expect(result.current.dockVisible).toBe(true)
    expect(result.current.scrimProps).toBeNull()
  })

  it('窄窗口打开侧栏：侧栏可见、dock 退出、渲染遮罩', () => {
    stubMatchMedia(true)
    const onSidebarCollapsedChange = vi.fn()
    const { result } = renderHook(() =>
      useWorkspaceDrawers({ ...baseOptions, onSidebarCollapsedChange }),
    )
    // 进入窄窗口且侧栏偏好开 → overlay 初始化为 sidebar
    expect(result.current.drawerOverlay).toBe('sidebar')
    expect(result.current.sidebarVisible).toBe(true)
    expect(result.current.dockVisible).toBe(false)
    expect(result.current.scrimProps?.className).toBe('workspace-scrim')
  })

  it('窄窗口下 dock 打开让侧栏退出（最近打开者获胜）', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useWorkspaceDrawers(baseOptions))
    expect(result.current.drawerOverlay).toBe('sidebar')
    act(() => result.current.notifyDockOpened())
    expect(result.current.drawerOverlay).toBe('dock')
    expect(result.current.sidebarVisible).toBe(false)
    expect(result.current.dockVisible).toBe(true)
  })

  it('Escape 关闭当前抽屉并把焦点恢复到触发控件', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useWorkspaceDrawers(baseOptions))
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    act(() => result.current.notifyDockOpened(trigger))
    expect(trigger.isConnected).toBe(true)
    expect(result.current.drawerOverlay).toBe('dock')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(result.current.drawerOverlay).toBeNull()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('遮罩点击关闭当前抽屉', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useWorkspaceDrawers(baseOptions))
    act(() => result.current.scrimProps?.onClick())
    expect(result.current.drawerOverlay).toBeNull()
    expect(result.current.scrimProps).toBeNull()
  })

  it('显式收起侧栏走偏好变更并清 overlay', () => {
    stubMatchMedia(true)
    const onSidebarCollapsedChange = vi.fn()
    const { result } = renderHook(() =>
      useWorkspaceDrawers({ ...baseOptions, onSidebarCollapsedChange }),
    )
    act(() => result.current.toggleSidebar())
    expect(onSidebarCollapsedChange).toHaveBeenCalledWith(true)
    expect(result.current.drawerOverlay).toBeNull()
  })

  it('跨断点到宽窗口：overlay 失效，两抽屉回到偏好', () => {
    const listeners = stubMatchMedia(true)
    const { result } = renderHook(() => useWorkspaceDrawers(baseOptions))
    expect(result.current.drawerOverlay).toBe('sidebar')

    const query = listeners.keys().next().value as MediaQueryList
    act(() => {
      Object.defineProperty(query, 'matches', { value: false })
      for (const cb of Array.from(listeners.get(query) ?? [])) cb({ matches: false })
    })
    expect(result.current.isNarrow).toBe(false)
    expect(result.current.drawerOverlay).toBeNull()
    expect(result.current.sidebarVisible).toBe(true)
    expect(result.current.dockVisible).toBe(true)
  })

  it('中文输入法组合态中 Escape 不关闭抽屉', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useWorkspaceDrawers(baseOptions))
    expect(result.current.drawerOverlay).toBe('sidebar')
    const composing = new KeyboardEvent('keydown', { key: 'Escape' })
    Object.defineProperty(composing, 'isComposing', { value: true })
    act(() => {
      window.dispatchEvent(composing)
    })
    expect(result.current.drawerOverlay).toBe('sidebar')
  })
})
