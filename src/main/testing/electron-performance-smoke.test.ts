import { describe, expect, it } from 'vitest'
import {
  shouldWaitForSavedMarker,
  summarizeElectronPerformance,
} from './electron-performance-smoke'

describe('summarizeElectronPerformance', () => {
  it('reports deterministic median, p95, and maximum without mutating input', () => {
    const latencies = [40, 10, 30, 20, 50]

    expect(summarizeElectronPerformance(latencies)).toEqual({
      count: 5,
      p50Ms: 30,
      p95Ms: 50,
      maxMs: 50,
    })
    expect(latencies).toEqual([40, 10, 30, 20, 50])
  })

  it('handles an empty cycle without producing NaN metrics', () => {
    expect(summarizeElectronPerformance([])).toEqual({
      count: 0,
      p50Ms: 0,
      p95Ms: 0,
      maxMs: 0,
    })
  })

  it('只在收到成功保存回执后轮询磁盘标记', () => {
    expect(shouldWaitForSavedMarker({ ok: true })).toBe(true)
    expect(shouldWaitForSavedMarker({ ok: false, code: 'SAVE_RESULT_TIMEOUT' })).toBe(false)
  })
})
