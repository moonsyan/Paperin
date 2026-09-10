// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSystemFileOpen } from './useSystemFileOpen'

describe('useSystemFileOpen', () => {
  it('routes associated files through the existing document-tab opener', async () => {
    let listener: ((path: string) => void) | undefined
    const unsubscribe = vi.fn()
    const onOpenFile = vi.fn((next: (path: string) => void) => {
      listener = next
      return unsubscribe
    })
    Object.defineProperty(window, 'desktopAPI', {
      configurable: true,
      value: { window: { onOpenFile } },
    })
    const openDocumentPath = vi.fn(async () => true)

    const { unmount } = renderHook(() => useSystemFileOpen(openDocumentPath))
    expect(onOpenFile).toHaveBeenCalledOnce()

    await act(async () => {
      listener?.('D:\\outside\\temporary.md')
    })
    expect(openDocumentPath).toHaveBeenCalledWith('D:\\outside\\temporary.md', true)

    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('does not subscribe when the preload bridge is unavailable', () => {
    Object.defineProperty(window, 'desktopAPI', { configurable: true, value: undefined })
    const openDocumentPath = vi.fn(async () => true)
    expect(() => renderHook(() => useSystemFileOpen(openDocumentPath))).not.toThrow()
    expect(openDocumentPath).not.toHaveBeenCalled()
  })
})
