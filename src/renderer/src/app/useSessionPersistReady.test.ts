// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSessionPersistReady } from './useSessionPersistReady'

describe('useSessionPersistReady', () => {
  it('设置未就绪时不允许持久化，就绪后保持允许', () => {
    const { result } = renderHook(() => useSessionPersistReady())
    expect(result.current.persistReady).toBe(false)

    act(() => {
      result.current.syncFromSettings(false)
    })
    expect(result.current.persistReady).toBe(false)

    act(() => {
      result.current.syncFromSettings(true)
    })
    expect(result.current.persistReady).toBe(true)

    act(() => {
      result.current.syncFromSettings(false)
    })
    expect(result.current.persistReady).toBe(true)
  })

  it('渲染阶段不得调用 syncFromSettings（由 AppComposition useEffect 回填）', () => {
    const { result, rerender } = renderHook(
      ({ ready }: { ready: boolean }) => {
        const latch = useSessionPersistReady()
        return { latch, ready }
      },
      { initialProps: { ready: false } },
    )
    expect(result.current.latch.persistReady).toBe(false)
    rerender({ ready: true })
    expect(result.current.latch.persistReady).toBe(false)
    act(() => {
      result.current.latch.syncFromSettings(true)
    })
    expect(result.current.latch.persistReady).toBe(true)
  })
})
