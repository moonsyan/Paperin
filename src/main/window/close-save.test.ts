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

  it('超时会通知放弃，但已启动的保存仍会继续跑完', async () => {
    vi.useFakeTimers()
    try {
      let finished = false
      const onTimeout = vi.fn()
      const result = waitForCloseSave(
        () => new Promise((resolve) => {
          setTimeout(() => {
            finished = true
            resolve(true)
          }, 20_000)
        }),
        15_000,
        onTimeout,
      )
      await vi.advanceTimersByTimeAsync(15_000)
      await expect(result).resolves.toBe('timedout')
      expect(onTimeout).toHaveBeenCalledOnce()
      expect(finished).toBe(false)
      await vi.advanceTimersByTimeAsync(5_000)
      expect(finished).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
