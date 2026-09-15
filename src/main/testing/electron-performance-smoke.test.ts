import { describe, expect, it } from 'vitest'
import {
  createSaveShortcutInput,
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

  it('只在成功回执或观察器不可用时轮询磁盘标记', () => {
    expect(shouldWaitForSavedMarker({ ok: true })).toBe(true)
    expect(shouldWaitForSavedMarker({ ok: false, code: 'SAVE_RESULT_TIMEOUT' })).toBe(false)
    expect(shouldWaitForSavedMarker({ ok: false, code: 'SAVE_OBSERVER_UNAVAILABLE' })).toBe(true)
  })

  it('用 Electron 原生输入格式发送当前平台的保存快捷键', () => {
    expect(createSaveShortcutInput('win32')).toEqual({
      type: 'keyDown',
      keyCode: 'S',
      modifiers: ['control'],
    })
    expect(createSaveShortcutInput('darwin')).toEqual({
      type: 'keyDown',
      keyCode: 'S',
      modifiers: ['meta'],
    })
  })
})
