import { describe, expect, it } from 'vitest'
import {
  createSaveShortcutInput,
  hasSavedMarkdownMarkers,
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
