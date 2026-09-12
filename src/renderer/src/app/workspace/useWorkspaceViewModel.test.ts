// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceViewModel } from './useWorkspaceViewModel'
import { buildSearchPreferencePatch } from './workspace-view-model'
import type { SearchPreference } from '../useEditorSearch'

const PREFS: SearchPreference = {
  query: '',
  useRegex: true,
  caseSensitive: true,
  wholeWord: false,
  replacement: '',
}

const makeOptions = (overrides: Partial<Parameters<typeof useWorkspaceViewModel>[0]> = {}) => {
  const base: Parameters<typeof useWorkspaceViewModel>[0] = {
    handleSelectWorkspaceFile: vi.fn(async () => true),
    setSearchMode: vi.fn(),
    setSearchPref: vi.fn(),
    setSearchEpoch: vi.fn(),
    focusEditorLine: vi.fn(),
  }
  return { ...base, ...overrides }
}

/** 读取 setSearchPref 的函数式更新结果 */
const applyLastSearchPref = (
  setSearchPref: ReturnType<typeof vi.fn>,
  current: SearchPreference,
): SearchPreference => {
  const calls = setSearchPref.mock.calls
  if (calls.length === 0) return current
  const updater = calls[calls.length - 1][0]
  return typeof updater === 'function' ? (updater as (p: SearchPreference) => SearchPreference)(current) : current
}

describe('buildSearchPreferencePatch', () => {
  it('未指定的开关沿用当前偏好，不隐式重置', () => {
    const patch = buildSearchPreferencePatch(PREFS, { query: 'kw' })
    expect(patch.query).toBe('kw')
    expect(patch.useRegex).toBe(true)
    expect(patch.caseSensitive).toBe(true)
  })

  it('显式指定的开关覆盖当前偏好', () => {
    const patch = buildSearchPreferencePatch(PREFS, { query: 'kw', useRegex: false, caseSensitive: false })
    expect(patch.useRegex).toBe(false)
    expect(patch.caseSensitive).toBe(false)
  })
})

describe('useWorkspaceViewModel.reveal', () => {
  it('打开成功后按请求接力搜索并递增 epoch', async () => {
    const setSearchPref = vi.fn()
    const setSearchEpoch = vi.fn()
    const setSearchMode = vi.fn()
    const handleSelectWorkspaceFile = vi.fn(async () => true)
    const { result } = renderHook(() =>
      useWorkspaceViewModel(
        makeOptions({ handleSelectWorkspaceFile, setSearchPref, setSearchEpoch, setSearchMode }),
      ),
    )

    let ok = false
    await act(async () => {
      ok = await result.current.reveal({
        path: '/tmp/a.md',
        search: { query: 'kw', useRegex: false, openFindBar: true },
      })
    })

    expect(ok).toBe(true)
    expect(handleSelectWorkspaceFile).toHaveBeenCalledWith('/tmp/a.md', undefined)
    expect(applyLastSearchPref(setSearchPref, PREFS)).toMatchObject({
      query: 'kw',
      useRegex: false,
      caseSensitive: true,
    })
    expect(setSearchEpoch).toHaveBeenCalledOnce()
    expect(setSearchMode).toHaveBeenCalledWith('find')
  })

  it('openFindBar 未设置时不打开查找栏（工作区搜索结果保持静默高亮）', async () => {
    const setSearchMode = vi.fn()
    const { result } = renderHook(() => useWorkspaceViewModel(makeOptions({ setSearchMode })))

    await act(async () => {
      await result.current.reveal({ path: '/tmp/a.md', search: { query: 'kw' } })
    })

    expect(setSearchMode).not.toHaveBeenCalled()
  })

  it('query 为空时不触碰任何搜索状态', async () => {
    const setSearchPref = vi.fn()
    const setSearchEpoch = vi.fn()
    const setSearchMode = vi.fn()
    const { result } = renderHook(() =>
      useWorkspaceViewModel(makeOptions({ setSearchPref, setSearchEpoch, setSearchMode })),
    )

    await act(async () => {
      await result.current.reveal({ path: '/tmp/a.md', search: { query: '' } })
    })

    expect(setSearchPref).not.toHaveBeenCalled()
    expect(setSearchEpoch).not.toHaveBeenCalled()
    expect(setSearchMode).not.toHaveBeenCalled()
  })

  it('focusLine 请求会带动光标定位', async () => {
    const focusEditorLine = vi.fn()
    const { result } = renderHook(() => useWorkspaceViewModel(makeOptions({ focusEditorLine })))

    await act(async () => {
      await result.current.reveal({ path: '/tmp/a.md', focusLine: 42 })
    })

    expect(focusEditorLine).toHaveBeenCalledWith(42)
  })

  it('打开失败时不接力任何后续动作', async () => {
    const setSearchPref = vi.fn()
    const focusEditorLine = vi.fn()
    const handleSelectWorkspaceFile = vi.fn(async () => false)
    const { result } = renderHook(() =>
      useWorkspaceViewModel(makeOptions({ handleSelectWorkspaceFile, setSearchPref, focusEditorLine })),
    )

    let ok = true
    await act(async () => {
      ok = await result.current.reveal({
        path: '/tmp/a.md',
        search: { query: 'kw' },
        focusLine: 3,
      })
    })

    expect(ok).toBe(false)
    expect(setSearchPref).not.toHaveBeenCalled()
    expect(focusEditorLine).not.toHaveBeenCalled()
  })

  it('并发点选只保留最后一次：旧请求迟到返回不得覆盖新选择', async () => {
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
    const focusEditorLine = vi.fn()

    const { result } = renderHook(() =>
      useWorkspaceViewModel(
        makeOptions({ handleSelectWorkspaceFile, setSearchPref, setSearchEpoch, focusEditorLine }),
      ),
    )

    act(() => {
      void result.current.reveal({ path: '/tmp/first.md', search: { query: 'first' }, focusLine: 1 })
      void result.current.reveal({ path: '/tmp/second.md', search: { query: 'second' }, focusLine: 2 })
    })

    // 第二次先返回：应完成一次接力
    await act(async () => {
      await Promise.resolve()
    })
    expect(setSearchEpoch).toHaveBeenCalledTimes(1)
    expect(applyLastSearchPref(setSearchPref, PREFS).query).toBe('second')
    expect(focusEditorLine).toHaveBeenCalledWith(2)

    // 第一次迟到返回：seq 已过期，不得再写入
    await act(async () => {
      resolveFirst(true)
      await firstPromise
    })
    expect(setSearchEpoch).toHaveBeenCalledTimes(1)
    expect(applyLastSearchPref(setSearchPref, PREFS).query).toBe('second')
    expect(focusEditorLine).toHaveBeenCalledTimes(1)
    expect(focusEditorLine).toHaveBeenCalledWith(2)
  })
})
