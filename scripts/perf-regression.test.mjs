import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const SCRIPT = fileURLToPath(new URL('./perf-regression.mjs', import.meta.url))

let tempDir

const writeThresholds = async (targets) => {
  const file = join(tempDir, `thresholds-${Math.random().toString(36).slice(2)}.json`)
  await writeFile(file, JSON.stringify({ targets }), 'utf-8')
  return file
}

const runRegression = async (thresholdsFile) =>
  execFileAsync(process.execPath, [
    SCRIPT,
    '--documents',
    '12',
    '--size',
    '1024',
    '--thresholds',
    thresholdsFile,
  ])

describe('perf-regression 阈值守卫', () => {
  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'mk-perf-reg-'))
  })

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true })
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
