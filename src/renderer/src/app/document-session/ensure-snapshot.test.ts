// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import {
  ensureFreshSnapshot,
  SNAPSHOT_SETTLE_POLL_MS,
  SNAPSHOT_SETTLE_TIMEOUT_MS,
} from './ensure-snapshot'

afterEach(cleanup)

describe('ensureFreshSnapshot 快照契约', () => {
  it('编辑器无未落账输入时立即返回缓存，零等待', async () => {
    const delay = vi.fn().mockResolvedValue(undefined)
    const outcome = await ensureFreshSnapshot(
      { hasPendingChanges: () => false, readSnapshot: () => 'saved-content', delay },
    )
    expect(outcome).toEqual({ content: 'saved-content', settled: true })
    expect(delay).not.toHaveBeenCalled()
  })

  it('有未落账输入时等待落账，返回含末次输入的新快照', async () => {
    let pending = true
    let snapshot = 'old-content'
    const delay = vi.fn().mockImplementation(async () => {
      // 第一次轮询后模拟 markdownUpdated 防抖落账
      if (delay.mock.calls.length >= 1) {
        pending = false
        snapshot = 'old-content + last-keystroke'
      }
    })
    const outcome = await ensureFreshSnapshot(
      { hasPendingChanges: () => pending, readSnapshot: () => snapshot, delay },
    )
    expect(outcome).toEqual({ content: 'old-content + last-keystroke', settled: true })
    expect(delay).toHaveBeenCalled()
  })

  it('等待超时后仍返回当前缓存，但 settled=false（失败出口）', async () => {
    // Date.now 恒定推进很小步，让 deadline 快速到期
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 4_900
      return now
    })
    try {
      const outcome = await ensureFreshSnapshot(
        { hasPendingChanges: () => true, readSnapshot: () => 'stale-cache', delay: async () => {} },
        5_000,
        50,
      )
      expect(outcome).toEqual({ content: 'stale-cache', settled: false })
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('默认超时与轮询参数与防抖窗口匹配', () => {
    // 防抖 ~200ms：轮询间隔必须显著小于它，超时须远大于它
    expect(SNAPSHOT_SETTLE_POLL_MS).toBeLessThan(200)
    expect(SNAPSHOT_SETTLE_TIMEOUT_MS).toBeGreaterThanOrEqual(2_000)
  })

  it('落账恰好发生在超时边缘时以最后一次探测为准', async () => {
    let pending = true
    let calls = 0
    const delay = vi.fn().mockImplementation(async () => {
      calls++
      if (calls >= 3) pending = false
    })
    const outcome = await ensureFreshSnapshot(
      { hasPendingChanges: () => pending, readSnapshot: () => 'fresh', delay },
      10_000,
      1,
    )
    expect(outcome.settled).toBe(true)
    expect(outcome.content).toBe('fresh')
  })
})
