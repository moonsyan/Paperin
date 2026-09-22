import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeFile } from 'fs/promises'
import {
  WORKSPACE_SEARCH_METRIC_KEYS,
  createWorkspaceSearchMetricsTracker,
  isPrivacySafeWorkspaceSearchMetricsJson,
  type WorkspaceSearchMetrics,
} from './workspace-search-metrics'
import { runWorkspaceSearch } from './workspace-search-handler'

const FORBIDDEN_JSON_KEYS = ['path', 'query', 'preview', 'content'] as const

const assertPrivacySafe = (metrics: WorkspaceSearchMetrics) => {
  expect(Object.keys(metrics).sort()).toEqual([...WORKSPACE_SEARCH_METRIC_KEYS].sort())
  const json = JSON.stringify(metrics)
  expect(isPrivacySafeWorkspaceSearchMetricsJson(json)).toBe(true)
  for (const key of FORBIDDEN_JSON_KEYS) {
    expect(json).not.toContain(`"${key}"`)
  }
}

describe('WorkspaceSearchMetrics', () => {
  it('各阶段耗时只累加到对应字段', () => {
    let clock = 100
    const now = () => clock
    const tracker = createWorkspaceSearchMetricsTracker(now)
    tracker.addDiscovery(12)
    tracker.addMetadata(3)
    tracker.addRead(40)
    tracker.addScan(5)
    clock = 200
    tracker.noteCacheHit()
    tracker.noteCacheHit()
    tracker.noteCacheMiss()
    tracker.noteCacheMiss()
    tracker.noteCacheMiss()
    clock = 200
    const metrics = tracker.finalize({
      discoveredFiles: 9,
      scannedFiles: 7,
    })
    expect(metrics).toEqual({
      discoveryMs: 12,
      metadataMs: 3,
      readMs: 40,
      scanMs: 5,
      totalMs: 100,
      discoveredFiles: 9,
      scannedFiles: 7,
      cacheHits: 2,
      cacheMisses: 3,
    })
    assertPrivacySafe(metrics)
  })

  describe('runWorkspaceSearch instrumentation', () => {
    let root = ''

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'paperin-search-metrics-'))
    })

    afterEach(() => {
      rmSync(root, { recursive: true, force: true })
    })

    it('成功搜索后记录完整分段指标', async () => {
      await writeFile(join(root, 'a.md'), 'alpha needle beta', 'utf-8')
      await writeFile(join(root, 'b.md'), 'plain text', 'utf-8')
      let recorded: WorkspaceSearchMetrics | undefined
      await runWorkspaceSearch(
        { dir: root, query: 'needle' },
        undefined,
        undefined,
        undefined,
        {
          now: () => 0,
          record: (metrics) => {
            recorded = metrics
          },
        },
      )
      expect(recorded).toBeDefined()
      expect(recorded!.discoveredFiles).toBe(2)
      expect(recorded!.scannedFiles).toBe(2)
      expect(recorded!.totalMs).toBeGreaterThanOrEqual(0)
      expect(recorded!.discoveryMs).toBeGreaterThanOrEqual(0)
      assertPrivacySafe(recorded!)
    })

    it('取消前仍记录完整数量与阶段时间', async () => {
      await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          writeFile(join(root, `doc-${index}.md`), `token-${index}`, 'utf-8'),
        ),
      )
      let recorded: WorkspaceSearchMetrics | undefined
      let checks = 0
      const stale = () => {
        checks += 1
        return checks > 1
      }
      await expect(
        runWorkspaceSearch(
          { dir: root, query: 'token' },
          undefined,
          stale,
          undefined,
          {
            now: () => 0,
            record: (metrics) => {
              recorded = metrics
            },
          },
        ),
      ).rejects.toMatchObject({ code: 'CANCELLED' })
      expect(recorded).toBeDefined()
      expect(recorded!.discoveredFiles).toBe(20)
      expect(recorded!.scannedFiles).toBeGreaterThanOrEqual(0)
      assertPrivacySafe(recorded!)
    })

    it('命中匹配上限后仍记录完整指标', async () => {
      const limits = { maxFiles: 50, maxFileBytes: 2_097_152, maxMatches: 3 }
      await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          writeFile(join(root, `hit-${index}.md`), `dup dup-${index}`, 'utf-8'),
        ),
      )
      let recorded: WorkspaceSearchMetrics | undefined
      await runWorkspaceSearch(
        { dir: root, query: 'dup' },
        limits,
        undefined,
        undefined,
        {
          now: () => 0,
          record: (metrics) => {
            recorded = metrics
          },
        },
      )
      expect(recorded).toBeDefined()
      expect(recorded!.scannedFiles).toBeLessThanOrEqual(10)
      assertPrivacySafe(recorded!)
    })
  })
})
