import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const SCRIPT = fileURLToPath(new URL('./perf-regression.mjs', import.meta.url))
const DEFAULT_THRESHOLDS = fileURLToPath(
  new URL('../docs/development/performance-baseline.json', import.meta.url),
)

let tempDir

const writeThresholds = async (targets, scenario) => {
  const file = join(tempDir, `thresholds-${Math.random().toString(36).slice(2)}.json`)
  await writeFile(file, JSON.stringify({ targets, scenario }), 'utf-8')
  return file
}

const runRegression = async (thresholdsFile, scenarioArgs = ['--documents', '12', '--size', '1024']) =>
  execFileAsync(process.execPath, [SCRIPT, ...scenarioArgs, '--thresholds', thresholdsFile])

describe('perf-regression 阈值守卫', () => {
  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mk-perf-reg-'))
  })

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('随仓库提供默认场景、实测基线和正数阈值', async () => {
    const document = JSON.parse(await readFile(DEFAULT_THRESHOLDS, 'utf-8'))
    expect(document.scenario).toEqual({ documents: 5000, bytesPerDoc: 2048 })
    expect(document.baseline.documents).toBe(5000)
    expect(document.baseline.bytesPerDoc).toBe(2048)
    for (const key of ['treeMs', 'indexMs', 'searchMs']) {
      expect(document.baseline[key]).toBeGreaterThan(0)
      expect(document.targets[key]).toBeGreaterThan(document.baseline[key])
    }
  })

  it('指标超阈值时以非零退出并在 stdout 打印指标（不打印 fixture 正文）', async () => {
    const file = await writeThresholds({ treeMs: 0.001, indexMs: 0.001, searchMs: 0.001 })
    let failed
    try {
      await runRegression(file)
      failed = false
    } catch (error) {
      failed = error
    }
    expect(failed).toBeTruthy()
    expect(failed.code).not.toBe(0)
    const stdout = String(failed.stdout ?? '')
    // 打印聚合指标供排查，但不包含 fixture 正文
    expect(stdout).toContain('treeMs')
    expect(stdout).toContain('超阈值')
    expect(stdout).not.toContain('补充段落')
  })

  it('指标达标时零退出', async () => {
    const file = await writeThresholds({ treeMs: 999999, indexMs: 999999, searchMs: 999999 })
    const result = await runRegression(file)
    expect(result.stdout).toContain('性能回归通过')
  })

  it('输出分段指标且保留 treeMs/indexMs/searchMs 口径', async () => {
    const file = await writeThresholds({ treeMs: 999999, indexMs: 999999, searchMs: 999999 })
    const result = await runRegression(file)
    const metrics = JSON.parse(result.stdout.slice(0, result.stdout.lastIndexOf('}') + 1))
    expect(metrics).toEqual(
      expect.objectContaining({
        treeMs: expect.any(Number),
        indexMs: expect.any(Number),
        searchMs: expect.any(Number),
        fixtureWriteMs: expect.any(Number),
        treeRunsMs: expect.any(Array),
        indexReadMs: expect.any(Number),
        indexParseMs: expect.any(Number),
        searchReadMs: expect.any(Number),
        searchScanMs: expect.any(Number),
        workspaceSearchMetrics: expect.objectContaining({
          discoveryMs: expect.any(Number),
          metadataMs: expect.any(Number),
          readMs: expect.any(Number),
          scanMs: expect.any(Number),
          totalMs: expect.any(Number),
          discoveredFiles: expect.any(Number),
          scannedFiles: expect.any(Number),
          cacheHits: expect.any(Number),
          cacheMisses: expect.any(Number),
        }),
      }),
    )
    expect(metrics.treeRunsMs).toHaveLength(3)
    expect(metrics.fixtureWriteMs).toBeGreaterThan(0)
    expect(String(result.stdout)).not.toContain('补充段落')
  })

  it('未传场景参数时使用阈值文件中记录的场景', async () => {
    const file = await writeThresholds(
      { treeMs: 999999, indexMs: 999999, searchMs: 999999 },
      { documents: 12, bytesPerDoc: 1024 },
    )
    const result = await runRegression(file, [])
    expect(result.stdout).toContain('"documents": 12')
    expect(result.stdout).toContain('"bytesPerDoc": 1024')
  })

  it('更新显式覆盖场景的基线时同步保存默认场景', async () => {
    const file = await writeThresholds(
      { treeMs: 999999, indexMs: 999999, searchMs: 999999 },
      { documents: 4, bytesPerDoc: 512 },
    )
    await runRegression(file, ['--documents', '7', '--size', '768', '--update-baseline'])

    const document = JSON.parse(await readFile(file, 'utf-8'))
    expect(document.scenario).toEqual({ documents: 7, bytesPerDoc: 768 })
    expect(document.baseline.documents).toBe(7)
    expect(document.baseline.bytesPerDoc).toBe(768)
  })

  it('默认 5000×2048B 场景按阈值文件判定，超阈值时非零退出且不打印正文', async () => {
    const document = JSON.parse(await readFile(DEFAULT_THRESHOLDS, 'utf-8'))
    expect(document.scenario).toEqual({ documents: 5000, bytesPerDoc: 2048 })
    expect(document.targets.treeMs).toBe(200)
    expect(document.targets.indexMs).toBe(2000)
    expect(document.targets.searchMs).toBe(1500)
    let result
    try {
      result = await execFileAsync(process.execPath, [SCRIPT], { timeout: 180_000 })
    } catch (error) {
      result = error
    }
    const stdout = String(result.stdout ?? '')
    expect(stdout).not.toContain('补充段落')
    const metrics = JSON.parse(stdout.slice(0, stdout.lastIndexOf('}') + 1))
    const exceeded = ['treeMs', 'indexMs', 'searchMs'].filter((key) => metrics[key] > document.targets[key])
    console.log(`PERF_REGRESSION_EXCEEDED ${JSON.stringify({ exceeded, nodeVersion: metrics.nodeVersion })}`)
    if (exceeded.length > 0) {
      expect(result.code).not.toBe(0)
      expect(stdout).toContain('超阈值')
      for (const key of exceeded) expect(stdout).toContain(`${key}=`)
    } else {
      expect(result.code ?? 0).toBe(0)
      expect(stdout).toContain('性能回归通过')
    }
  }, 180_000)

  it('阈值文件缺失时给出可读错误', async () => {
    let failed
    try {
      await runRegression(join(tempDir, 'not-exist.json'))
      failed = false
    } catch (error) {
      failed = error
    }
    expect(failed).toBeTruthy()
    expect(String(failed.stderr ?? '')).toContain('阈值文件')
  })
})
