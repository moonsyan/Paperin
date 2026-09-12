// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useSidebarFavorites } from './useSidebarFavorites'

afterEach(() => cleanup())

describe('useSidebarFavorites', () => {
  it('初始没有收藏', () => {
    const { result } = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))
    expect(result.current.favorites).toEqual([])
  })

  it('切换收藏：加入后再次切换移除', () => {
    const { result } = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))

    act(() => result.current.toggleFavorite('D:/Notes/a.md'))
    expect(result.current.favorites).toEqual(['D:/Notes/a.md'])

    act(() => result.current.toggleFavorite('D:/Notes/b.md'))
    expect(result.current.favorites).toEqual(['D:/Notes/a.md', 'D:/Notes/b.md'])

    act(() => result.current.toggleFavorite('D:/Notes/a.md'))
    expect(result.current.favorites).toEqual(['D:/Notes/b.md'])
  })

  it('按工作区作用域隔离（演示树使用独立作用域）', () => {
    const { result, rerender } = renderHook(
      ({ workspacePath }: { workspacePath: string | null }) =>
        useSidebarFavorites({ workspacePath, settingsReady: true }),
      { initialProps: { workspacePath: 'D:/Notes' as string | null } },
    )

    act(() => result.current.toggleFavorite('D:/Notes/a.md'))
    expect(result.current.favorites).toEqual(['D:/Notes/a.md'])

    rerender({ workspacePath: 'D:/Other' })
    expect(result.current.favorites).toEqual([])

    rerender({ workspacePath: 'D:/Notes' })
    expect(result.current.favorites).toEqual(['D:/Notes/a.md'])
  })

  it('设置未就绪时不写入持久化', () => {
    const set = vi.fn().mockResolvedValue({ ok: true })
    const original = window.desktopAPI
    Object.defineProperty(window, 'desktopAPI', {
      value: { settings: { set } },
      configurable: true,
      writable: true,
    })

    const { result } = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: false }))
    act(() => result.current.toggleFavorite('D:/Notes/a.md'))
    expect(set).not.toHaveBeenCalled()

    Object.defineProperty(window, 'desktopAPI', { value: original, configurable: true, writable: true })
  })
})
