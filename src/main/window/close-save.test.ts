import { describe, expect, it, vi } from 'vitest'
import { waitForCloseSave } from './close-save'

describe('窗口关闭保存等待', () => {
  it('仅在渲染进程明确返回 true 时视为成功', async () => {
    await expect(waitForCloseSave(async () => true, 1_000)).resolves.toBe('saved')
    await expect(waitForCloseSave(async () => false, 1_000)).resolves.toBe('incomplete')
    await expect(waitForCloseSave(async () => 'true', 1_000)).resolves.toBe('incomplete')
  })

  it('渲染进程保存异常时返回 failed', async () => {
    await expect(waitForCloseSave(async () => {
      throw new Error('renderer failed')
    }, 1_000)).resolves.toBe('failed')
  })

  it('渲染进程保存超时后返回 timedout', async () => {
    vi.useFakeTimers()
    try {
      const result = waitForCloseSave(() => new Promise(() => undefined), 15_000)
      await vi.advanceTimersByTimeAsync(15_000)
      await expect(result).resolves.toBe('timedout')
    } finally {
      vi.useRealTimers()
    }
  })
})
