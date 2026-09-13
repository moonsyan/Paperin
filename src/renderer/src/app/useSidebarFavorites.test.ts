// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useSidebarFavorites } from './useSidebarFavorites'

afterEach(() => cleanup())

type GetMock = ReturnType<typeof vi.fn>

/** 注入 desktopAPI.settings 读写桩，get 行为由用例控制 */
const injectSettingsApi = (get: GetMock) => {
  const set = vi.fn().mockResolvedValue({ ok: true })
  const original = window.desktopAPI
  Object.defineProperty(window, 'desktopAPI', {
    value: { settings: { get: async (key: string) => ({ ok: true, data: await get(key) }), set } },
    configurable: true,
    writable: true,
  })
  return { set, restore: () => Object.defineProperty(window, 'desktopAPI', { value: original, configurable: true, writable: true }) }
}

describe('useSidebarFavorites 持久化恢复', () => {
  it('挂载后读取持久化记录并恢复（重启场景）', async () => {
    const get = vi.fn().mockResolvedValue({ 'D:/Notes': ['D:/Notes/a.md', 'D:/Notes/b.md'] })
    const { restore } = injectSettingsApi(get)
    const { result } = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.favorites).toEqual(['D:/Notes/a.md', 'D:/Notes/b.md'])
    restore()
  })

  it('加载前点击不丢：本地新增与持久化并集合并', async () => {
    let resolveGet: (value: unknown) => void = () => {}
    const get = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveGet = resolve }))
    const { restore } = injectSettingsApi(get)
    const { result } = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))

    // 持久化读取尚未返回时用户收藏了新文件
    act(() => result.current.toggleFavorite('D:/Notes/new.md'))
    expect(result.current.favorites).toEqual(['D:/Notes/new.md'])

    await act(async () => {
      resolveGet({ 'D:/Notes': ['D:/Notes/a.md'] })
    })
    expect(result.current.favorites).toEqual(['D:/Notes/new.md', 'D:/Notes/a.md'])
    restore()
  })

  it('未触碰作用域在读取后可见，切换作用域互不覆盖', async () => {
    const get = vi.fn().mockResolvedValue({ 'D:/Notes': ['D:/Notes/a.md'], 'D:/Other': ['D:/Other/x.md'] })
    const { restore } = injectSettingsApi(get)
    const { result, rerender } = renderHook(
      ({ workspacePath }: { workspacePath: string | null }) =>
        useSidebarFavorites({ workspacePath, settingsReady: true }),
      { initialProps: { workspacePath: 'D:/Notes' as string | null } },
    )

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    rerender({ workspacePath: 'D:/Other' })
    expect(result.current.favorites).toEqual(['D:/Other/x.md'])
    rerender({ workspacePath: 'D:/Notes' })
    expect(result.current.favorites).toEqual(['D:/Notes/a.md'])
    restore()
  })

  it('损坏配置回退为空且不崩溃', async () => {
    const get = vi.fn().mockResolvedValue({ 'D:/Notes': '不是数组', broken: [1, 2] })
    const { restore } = injectSettingsApi(get)
    const { result } = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))

    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.favorites).toEqual([])
    // 用户仍可正常收藏
    act(() => result.current.toggleFavorite('D:/Notes/a.md'))
    expect(result.current.favorites).toEqual(['D:/Notes/a.md'])
    restore()
  })

  it('读取失败保留内存状态并完成水合', async () => {
    const get = vi.fn().mockRejectedValue(new Error('settings read failed'))
    const { restore } = injectSettingsApi(get)
    const { result } = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))

    act(() => result.current.toggleFavorite('D:/Notes/a.md'))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.favorites).toEqual(['D:/Notes/a.md'])
    restore()
  })

  it('空数组不当作用户删除：本地为空时保留持久化记录', async () => {
    let resolveGet: (value: unknown) => void = () => {}
    const get = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveGet = resolve }))
    const { restore } = injectSettingsApi(get)
    const { result } = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))

    await act(async () => {
      resolveGet({ 'D:/Notes': ['D:/Notes/a.md'] })
    })
    // 用户没有点击过（本地无记录）→ 持久化收藏完整保留
    expect(result.current.favorites).toEqual(['D:/Notes/a.md'])
    restore()
  })

  it('水合完成前不写入持久化（避免空值覆盖真实记录）', async () => {
    let resolveGet: (value: unknown) => void = () => {}
    const get = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveGet = resolve }))
    const { set, restore } = injectSettingsApi(get)
    const { result } = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))

    act(() => result.current.toggleFavorite('D:/Notes/new.md'))
    await act(async () => {
      resolveGet({ 'D:/Notes': ['D:/Notes/a.md'] })
    })
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    // 写入只发生在水合之后，且写的是合并结果而不是加载前的内存态
    await waitFor(() => expect(set).toHaveBeenCalled())
    const written = set.mock.calls[set.mock.calls.length - 1][1] as Record<string, string[]>
    expect(written['D:/Notes']).toEqual(['D:/Notes/new.md', 'D:/Notes/a.md'])
    restore()
  })
})

describe('useSidebarFavorites 基础行为', () => {
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


describe('收藏写回契约', () => {
  it('取消后写入空列表，重新挂载不会复活收藏', async () => {
    const get = vi.fn().mockResolvedValue({ 'D:/Notes': ['D:/Notes/a.md'] })
    const { set, restore } = injectSettingsApi(get)
    const first = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))
    await waitFor(() => expect(first.result.current.favorites).toEqual(['D:/Notes/a.md']))
    act(() => first.result.current.toggleFavorite('D:/Notes/a.md'))
    await waitFor(() => expect(set).toHaveBeenCalledWith('sidebarFavorites', { 'D:/Notes': [] }))
    first.unmount()
    get.mockResolvedValue({ 'D:/Notes': [] })
    const second = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))
    await waitFor(() => expect(second.result.current.hydrated).toBe(true))
    expect(second.result.current.favorites).toEqual([])
    restore()
  })

  it('读取失败时不把本地空缺写回覆盖已有收藏', async () => {
    const { set, restore } = injectSettingsApi(vi.fn().mockRejectedValue(new Error('IO_ERROR')))
    const { result } = renderHook(() => useSidebarFavorites({ workspacePath: 'D:/Notes', settingsReady: true }))
    act(() => result.current.toggleFavorite('D:/Notes/new.md'))
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 600)) })
    expect(set).not.toHaveBeenCalled()
    restore()
  })
})
