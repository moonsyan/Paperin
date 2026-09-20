import { describe, expect, it, afterEach, beforeEach } from 'vitest'
import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { mkdtempSync } from 'fs'
import {
  DEFAULT_WORKSPACE_SEARCH_LIMITS,
  runWorkspaceSearch,
  WORKSPACE_SEARCH_MAX_MATCHES,
} from './workspace-search-handler'
import { WORKSPACE_SCAN_MAX_FILE_BYTES } from '../../shared/workspace-coverage'
import { workspaceCoverageLegacyFlags } from '../../shared/workspace-coverage'

const UNIQUE = 'paperin_r05_unique_token'

const tempRoot = (): string => mkdtempSync(join(tmpdir(), 'paperin-search-cov-'))

const assertIncompleteEmpty = (coverage: Parameters<typeof workspaceCoverageLegacyFlags>[0]) => {
  expect(coverage.complete).toBe(false)
  const flags = workspaceCoverageLegacyFlags(coverage)
  expect(flags.scanTruncated).toBe(true)
  expect(flags.truncated).toBe(true)
}

describe('workspace search coverage', () => {
  let root = ''

  beforeEach(() => {
    root = tempRoot()
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('单篇 2 MiB + 1 byte 含唯一词时不显示完整无结果', async () => {
    const filePath = join(root, 'big.md')
    const tail = `\n${UNIQUE}`
    const bodySize = WORKSPACE_SCAN_MAX_FILE_BYTES + 1 - Buffer.byteLength(tail, 'utf-8')
    await writeFile(filePath, `${'a'.repeat(bodySize)}${tail}`, 'utf-8')
    const { matches, coverage } = await runWorkspaceSearch(
      { dir: root, query: UNIQUE },
      DEFAULT_WORKSPACE_SEARCH_LIMITS,
    )
    expect(matches).toHaveLength(0)
    expect(coverage.skipped['file-size']).toBe(1)
    assertIncompleteEmpty(coverage)
  })

  it('2 MiB 临界值与中文多字节尺寸仍可读', async () => {
    const exactPath = join(root, 'exact.md')
    const chinese = '中文笔记'
    const exactBody = `${'x'.repeat(WORKSPACE_SCAN_MAX_FILE_BYTES - Buffer.byteLength(chinese, 'utf-8'))}${chinese}`
    await writeFile(exactPath, exactBody, 'utf-8')
    const exact = await runWorkspaceSearch(
      { dir: root, query: '中文笔记' },
      DEFAULT_WORKSPACE_SEARCH_LIMITS,
    )
    expect(exact.coverage.complete).toBe(true)
    expect(exact.matches.length).toBeGreaterThan(0)

    const overPath = join(root, 'over.md')
    await writeFile(overPath, `${exactBody}x`, 'utf-8')
    const over = await runWorkspaceSearch(
      { dir: root, query: '中文笔记' },
      DEFAULT_WORKSPACE_SEARCH_LIMITS,
    )
    expect(over.coverage.skipped['file-size']).toBeGreaterThanOrEqual(1)
    expect(over.coverage.complete).toBe(false)
  })

  it('深度超限目录中的唯一词不算完整无结果', async () => {
    const deepDir = join(root, 'a', 'b', 'c', 'd', 'e', 'f')
    await mkdir(deepDir, { recursive: true })
    await writeFile(join(deepDir, 'deep.md'), `# hidden\n${UNIQUE}`, 'utf-8')
    const { matches, coverage } = await runWorkspaceSearch(
      { dir: root, query: UNIQUE },
      DEFAULT_WORKSPACE_SEARCH_LIMITS,
    )
    expect(matches).toHaveLength(0)
    expect(coverage.skipped.depth).toBeGreaterThan(0)
    assertIncompleteEmpty(coverage)
  })

  it('第 maxFiles+1 篇触发 file-budget 跳过', async () => {
    const limits = { ...DEFAULT_WORKSPACE_SEARCH_LIMITS, maxFiles: 3 }
    await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        writeFile(join(root, `f${index}.md`), index === 3 ? UNIQUE : 'other', 'utf-8'),
      ),
    )
    const { matches, coverage } = await runWorkspaceSearch({ dir: root, query: UNIQUE }, limits)
    expect(matches).toHaveLength(0)
    expect(coverage.skipped['file-budget']).toBeGreaterThan(0)
    assertIncompleteEmpty(coverage)
  })

  it('命中 200 条上限时扫描提前停止且 complete 为 false', async () => {
    await Promise.all(
      Array.from({ length: 250 }, (_, index) =>
        writeFile(join(root, `hit-${index}.md`), `line ${UNIQUE} ${index}`, 'utf-8'),
      ),
    )
    const { matches, coverage } = await runWorkspaceSearch(
      { dir: root, query: UNIQUE },
      { ...DEFAULT_WORKSPACE_SEARCH_LIMITS, maxMatches: WORKSPACE_SEARCH_MAX_MATCHES },
    )
    expect(matches).toHaveLength(WORKSPACE_SEARCH_MAX_MATCHES)
    expect(coverage.matchCapped).toBe(true)
    expect(coverage.complete).toBe(false)
    expect(coverage.matchCapped).toBe(true)
  })

  it('空库完整无结果', async () => {
    const { matches, coverage } = await runWorkspaceSearch(
      { dir: root, query: UNIQUE },
      DEFAULT_WORKSPACE_SEARCH_LIMITS,
    )
    expect(matches).toHaveLength(0)
    expect(coverage.complete).toBe(true)
    expect(workspaceCoverageLegacyFlags(coverage).truncated).toBe(false)
  })

  it('读取失败计入 read-error 且不算完整', async () => {
    if (process.platform === 'win32') return
    const unreadable = join(root, 'secret.md')
    await writeFile(unreadable, `${UNIQUE}\n`, 'utf-8')
    await writeFile(join(root, 'ok.md'), 'plain', 'utf-8')
    const { chmod } = await import('fs/promises')
    await chmod(unreadable, 0o000)
    const { coverage } = await runWorkspaceSearch(
      { dir: root, query: UNIQUE },
      DEFAULT_WORKSPACE_SEARCH_LIMITS,
    )
    expect(coverage.skipped['read-error']).toBeGreaterThan(0)
    expect(coverage.complete).toBe(false)
  })

  it('新 queryId 令旧搜索在下一文件边界退出', async () => {
    await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        writeFile(join(root, `slow-${index}.md`), `${UNIQUE} ${index}`, 'utf-8'),
      ),
    )
    let staleChecks = 0
    const stale = () => {
      staleChecks += 1
      return staleChecks > 2
    }
    await expect(
      runWorkspaceSearch({ dir: root, query: UNIQUE }, DEFAULT_WORKSPACE_SEARCH_LIMITS, stale),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
  })

  it('5000 篇规模下仍能命中尾部精确词（预算内）', async () => {
    const limits = { ...DEFAULT_WORKSPACE_SEARCH_LIMITS, maxFiles: 5000 }
    const batch = 200
    for (let offset = 0; offset < 5000; offset += batch) {
      await Promise.all(
        Array.from({ length: Math.min(batch, 5000 - offset) }, (_, index) => {
          const id = offset + index
          const content = id === 4999 ? `tail ${UNIQUE}` : `doc ${id}`
          return writeFile(join(root, `doc-${id}.md`), content, 'utf-8')
        }),
      )
    }
    const started = Date.now()
    const { matches, coverage } = await runWorkspaceSearch({ dir: root, query: UNIQUE }, limits)
    expect(Date.now() - started).toBeLessThan(120_000)
    expect(coverage.complete).toBe(true)
    expect(matches.some((match) => match.preview.includes(UNIQUE))).toBe(true)
  }, 120_000)
})
