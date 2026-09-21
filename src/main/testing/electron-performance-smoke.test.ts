import { describe, expect, it } from 'vitest'
import {
  createSaveShortcutInput,
  hasSavedMarkdownMarkers,
  parseStabilityHours,
  summarizeElectronPerformance,
  summarizeStability,
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

  it('磁盘 Markdown 中原文尾部和末次输入均存在才确认保存，允许标准转义', () => {
    const original = 'PERF_LARGE_DOCUMENT_TAIL'
    const edit = 'PERF_LARGE_DOCUMENT_EDITED'
    expect(hasSavedMarkdownMarkers(`PERF\\_LARGE\\_DOCUMENT\\_TAIL\nPERF\\_LARGE\\_DOCUMENT\\_EDITED`, original, edit)).toBe(true)
    expect(hasSavedMarkdownMarkers(`${original}\n${edit}`, original, edit)).toBe(true)
    expect(hasSavedMarkdownMarkers(original, original, edit)).toBe(false)
    expect(hasSavedMarkdownMarkers(edit, original, edit)).toBe(false)
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

describe('summarizeStability', () => {
  const hour = 60 * 60 * 1000
  const mib = 1024 * 1024

  it('用暖机后 30 分钟窗口与末两小时中位数计算增长，并报告 100 次重启', () => {
    const samples = {
      restartCycles: 100,
      rssSeries: [
        { at: 0, rssBytes: 400 * mib, watcherCount: 20 },
        { at: hour - 1, rssBytes: 500 * mib, watcherCount: 20 },
        { at: hour, rssBytes: 300 * mib, watcherCount: 10 },
        { at: hour + 15 * 60 * 1000, rssBytes: 300 * mib, watcherCount: 10 },
        { at: hour + 30 * 60 * 1000, rssBytes: 300 * mib, watcherCount: 10 },
        { at: 6 * hour, rssBytes: 320 * mib, watcherCount: 10 },
        { at: 8 * hour, rssBytes: 330 * mib, watcherCount: 10 },
      ],
    }
    expect(summarizeStability(samples)).toMatchObject({
      restartCycles: 100,
      watcherLeak: false,
    })
    const summary = summarizeStability(samples)
    expect(summary.rssGrowthPercent).toBeLessThanOrEqual(15)
    expect(summary.rssGrowthMiB).toBeLessThanOrEqual(100)
    expect(summary.withinBudget).toBe(true)
  })

  it('watcher 增多或内存超限时不能判通过', () => {
    const leaking = summarizeStability({
      restartCycles: 100,
      rssSeries: [
        { at: hour, rssBytes: 300 * mib, watcherCount: 10 },
        { at: hour + 30 * 60 * 1000, rssBytes: 300 * mib, watcherCount: 10 },
        { at: 8 * hour, rssBytes: 300 * mib, watcherCount: 12 },
      ],
    })
    expect(leaking).toMatchObject({ restartCycles: 100, watcherLeak: true, withinBudget: false })
  })

  it('解析 --stability-hours', () => {
    expect(parseStabilityHours(['--perf-electron'])).toBe(0)
    expect(parseStabilityHours(['--stability-hours', '8'])).toBe(8)
    expect(parseStabilityHours(['--stability-hours=8'])).toBe(8)
  })
})
