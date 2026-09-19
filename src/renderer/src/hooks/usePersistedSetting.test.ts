// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPersistedSettings, usePersistedSetting } from './usePersistedSetting'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('flushPersistedSettings', () => {
  it('等待所有防抖设置写回完成', async () => {
    let release!: () => void
    const set = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
    vi.stubGlobal('window', Object.assign(window, { desktopAPI: { settings: { set } } }))
    renderHook(() => usePersistedSetting('sidebarWidth', 280, true, 10_000))
    const flushed = flushPersistedSettings()
    expect(set).toHaveBeenCalledWith('sidebarWidth', 280)
    let done = false
    void flushed.then(() => { done = true })
    await Promise.resolve()
    expect(done).toBe(false)
    release()
    await flushed
    expect(done).toBe(true)
  })
})
