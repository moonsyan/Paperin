// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftPersistence } from './useDraftPersistence'

const persistDraft = vi.fn()
const removeDraft = vi.fn()
const sha256Text = vi.fn(async (text: string) => `hash-${text.length}`)

vi.mock('../lib/drafts', () => ({
  saveDraft: (...args: unknown[]) => persistDraft(...args),
  deleteDraft: (...args: unknown[]) => removeDraft(...args),
  sha256Text: (text: string) => sha256Text(text),
}))

afterEach(cleanup)

describe('useDraftPersistence', () => {
  beforeEach(() => {
    persistDraft.mockReset()
    removeDraft.mockReset()
    sha256Text.mockClear()
  })

  it('fresh 窗口（enabled:false）不写不删草稿', async () => {
    const onDraftPersist = vi.fn()
    renderHook(() =>
      useDraftPersistence({
        activeFileId: 'f1',
        content: '输入',
        ready: true,
        enabled: false,
        onDraftPersist,
      }),
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1100))
    })
    expect(persistDraft).not.toHaveBeenCalled()
    expect(onDraftPersist).not.toHaveBeenCalled()
  })

  it('持久化被拒绝：保留编辑、提示一次、不触发 success', async () => {
    vi.useFakeTimers()
    try {
      persistDraft.mockRejectedValue(new Error('DRAFT_SESSION_CONFLICT'))
      const onDraftPersist = vi.fn()
      renderHook(() =>
        useDraftPersistence({
          activeFileId: 'f1',
          content: '未保存输入',
          ready: true,
          enabled: true,
          draftSessionId: 'sess-b',
          onDraftPersist,
        }),
      )
      await act(async () => {
        vi.advanceTimersByTime(1100)
        await Promise.resolve()
      })
      expect(onDraftPersist).toHaveBeenCalledWith('failure', expect.any(Error))
      expect(onDraftPersist).not.toHaveBeenCalledWith('success')
    } finally {
      vi.useRealTimers()
    }
  })

  it('关闭前末次输入：切换标签时冲刷防抖中的草稿', async () => {
    vi.useFakeTimers()
    try {
      persistDraft.mockResolvedValue(undefined)
      const onDraftPersist = vi.fn()
      const { rerender } = renderHook(
        ({ activeFileId, content }: { activeFileId: string; content: string }) =>
          useDraftPersistence({
            activeFileId,
            content,
            ready: true,
            enabled: true,
            draftSessionId: 'sess-a',
            getLiveContent: () => '实时内容',
            onDraftPersist,
          }),
        { initialProps: { activeFileId: 'a', content: '滞后内容' } },
      )
      await act(async () => {
        rerender({ activeFileId: 'b', content: '' })
      })
      expect(persistDraft).toHaveBeenCalledWith('a', '实时内容', undefined, 'sess-a')
    } finally {
      vi.useRealTimers()
    }
  })

  it('备份成功与磁盘保存分离：回调 success 供 UI 显示草稿已备份', async () => {
    vi.useFakeTimers()
    try {
      persistDraft.mockResolvedValue(undefined)
      const onDraftPersist = vi.fn()
      renderHook(() =>
        useDraftPersistence({
          activeFileId: 'f1',
          content: 'x',
          ready: true,
          enabled: true,
          draftSessionId: 'sess-a',
          onDraftPersist,
        }),
      )
      await act(async () => {
        vi.advanceTimersByTime(1100)
        await Promise.resolve()
      })
      expect(onDraftPersist).toHaveBeenCalledWith('success')
    } finally {
      vi.useRealTimers()
    }
  })
})
