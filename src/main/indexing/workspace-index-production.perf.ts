import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { performance } from 'perf_hooks'
import { createWorkspaceIndexFilesystemDependencies } from './workspace-index-filesystem'
import { createWorkspaceIndexService } from './workspace-index-service'

interface PerformanceThresholds {
  scenario: { documents: number; bytesPerDoc: number }
  targets: { coldIndexMs: number; warmRefreshMs: number; incrementalRefreshMs: number }
}

const thresholdPath = resolve('docs/development/production-performance-baseline.json')
let root = ''
let thresholds: PerformanceThresholds

const createContent = (index: number, bytes: number, marker = 'initial'): string => {
  const header = `# Document ${index}\n\n#performance #production\n\n${marker}\n\n`
  return `${header}${'x'.repeat(Math.max(0, bytes - Buffer.byteLength(header)))}`
}

beforeAll(async () => {
  thresholds = JSON.parse(await readFile(thresholdPath, 'utf-8')) as PerformanceThresholds
  root = await mkdtemp(join(tmpdir(), 'lfh-production-index-perf-'))
  const { documents, bytesPerDoc } = thresholds.scenario
  const batchSize = 200
  for (let start = 0; start < documents; start += batchSize) {
    await Promise.all(
      Array.from({ length: Math.min(batchSize, documents - start) }, (_, offset) => {
        const index = start + offset
        return writeFile(
          join(root, `${String(index).padStart(5, '0')}.md`),
          createContent(index, bytesPerDoc),
          'utf-8',
        )
      }),
    )
  }
}, 120_000)

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

describe('production WorkspaceIndexService performance gate', () => {
  it('5000 个真实 Markdown 文件完成冷索引，并在刷新时只重读变更文件', async () => {
    const productionDeps = createWorkspaceIndexFilesystemDependencies()
    let readCount = 0
    const service = createWorkspaceIndexService({
      ...productionDeps,
      readFileText: async (path) => {
        readCount++
        return productionDeps.readFileText(path)
      },
    })
    const rssSamples: number[] = []
    const sampler = setInterval(() => rssSamples.push(process.memoryUsage().rss), 10)
    sampler.unref()

    const coldStartedAt = performance.now()
    const cold = await service.refresh(root)
    const coldIndexMs = performance.now() - coldStartedAt
    expect(cold.complete).toBe(true)
    expect(cold.truncated).toBe(false)
    expect(Object.keys(cold.index.documents)).toHaveLength(thresholds.scenario.documents)
    expect(readCount).toBe(thresholds.scenario.documents)

    const warmStartedAt = performance.now()
    await service.refresh(root)
    const warmRefreshMs = performance.now() - warmStartedAt
    expect(readCount).toBe(thresholds.scenario.documents)

    const changedPath = join(root, '02500.md')
    const previousStat = await stat(changedPath)
    await writeFile(
      changedPath,
      createContent(2500, thresholds.scenario.bytesPerDoc, 'incremental-update'),
      'utf-8',
    )
    const changedMtime = new Date(previousStat.mtimeMs + 1_000)
    await utimes(changedPath, changedMtime, changedMtime)

    const incrementalStartedAt = performance.now()
    const incremental = await service.refresh(root)
    const incrementalRefreshMs = performance.now() - incrementalStartedAt
    clearInterval(sampler)

    expect(readCount).toBe(thresholds.scenario.documents + 1)
    expect(incremental.index.documents[changedPath])
      .not.toBe(cold.index.documents[changedPath])

    const metrics = {
      generatedAt: new Date().toISOString(),
      documents: thresholds.scenario.documents,
      bytesPerDoc: thresholds.scenario.bytesPerDoc,
      coldIndexMs: Math.round(coldIndexMs * 100) / 100,
      warmRefreshMs: Math.round(warmRefreshMs * 100) / 100,
      incrementalRefreshMs: Math.round(incrementalRefreshMs * 100) / 100,
      peakRssMb: Math.round((Math.max(...rssSamples, process.memoryUsage().rss) / 1024 / 1024) * 10) / 10,
      nodeVersion: process.version,
    }
    console.log(`PRODUCTION_PERF_METRICS ${JSON.stringify(metrics)}`)

    expect(metrics.coldIndexMs).toBeLessThanOrEqual(thresholds.targets.coldIndexMs)
    expect(metrics.warmRefreshMs).toBeLessThanOrEqual(thresholds.targets.warmRefreshMs)
    expect(metrics.incrementalRefreshMs).toBeLessThanOrEqual(thresholds.targets.incrementalRefreshMs)
  }, 120_000)
})
