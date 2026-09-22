import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { createInitialWorkspaceCoverage } from '../../shared/workspace-coverage'
import type { WorkspaceIndex } from '../../shared/workspace-index'
import {
  CACHE_SCHEMA_VERSION,
  createFileWorkspaceIndexCache,
  MAX_CACHE_FILE_BYTES,
  parseWorkspaceIndexCachePayload,
} from './workspace-index-cache'

const sampleIndex = (root: string, generation = 1): WorkspaceIndex => ({
  workspacePath: root,
  generatedAt: '2026-09-22T00:00:00.000Z',
  generation,
  complete: true,
  truncated: false,
  coverage: createInitialWorkspaceCoverage(),
  documents: {},
  links: [],
  tags: [],
  assets: [],
  diagnostics: [],
})

describe('workspace-index-cache：schema 与根绑定', () => {
  it('与 save 相同形状的最小 payload 可解析', () => {
    const root = 'D:/notes'
    const index = sampleIndex(root)
    const raw = JSON.stringify({
      cacheSchemaVersion: CACHE_SCHEMA_VERSION,
      workspacePath: root,
      generatedAt: index.generatedAt,
      generation: index.generation,
      complete: index.complete,
      truncated: index.truncated,
      coverage: index.coverage,
      documents: index.documents,
      links: index.links,
      tags: index.tags,
      assets: index.assets,
      diagnostics: index.diagnostics,
    })
    expect(parseWorkspaceIndexCachePayload(raw, root)?.generation).toBe(1)
  })

  it('合法 payload 通过校验并绑定工作区根', () => {
    const root = 'D:/notes'
    const parsed = parseWorkspaceIndexCachePayload(
      JSON.stringify({ ...sampleIndex(root), cacheSchemaVersion: CACHE_SCHEMA_VERSION }),
      root,
    )
    expect(parsed?.workspacePath).toBe(root)
    expect(parsed?.generation).toBe(1)
  })

  it('错误根、未知 schema、缺 documents 时拒绝', () => {
    const root = 'D:/notes'
    expect(
      parseWorkspaceIndexCachePayload(
        JSON.stringify({ ...sampleIndex('D:/other'), cacheSchemaVersion: CACHE_SCHEMA_VERSION }),
        root,
      ),
    ).toBeNull()
    expect(
      parseWorkspaceIndexCachePayload(
        JSON.stringify({ ...sampleIndex(root), cacheSchemaVersion: 999 }),
        root,
      ),
    ).toBeNull()
    expect(parseWorkspaceIndexCachePayload(JSON.stringify({ cacheSchemaVersion: CACHE_SCHEMA_VERSION }), root)).toBeNull()
  })

  it('畸形 links/documents/coverage 与正文 lines 字段拒绝', () => {
    const root = 'D:/notes'
    const base = { ...sampleIndex(root), cacheSchemaVersion: CACHE_SCHEMA_VERSION }
    expect(parseWorkspaceIndexCachePayload(JSON.stringify({ ...base, documents: [] }), root)).toBeNull()
    expect(parseWorkspaceIndexCachePayload(JSON.stringify({ ...base, links: {} }), root)).toBeNull()
    expect(parseWorkspaceIndexCachePayload(JSON.stringify({ ...base, coverage: null }), root)).toBeNull()
    expect(
      parseWorkspaceIndexCachePayload(
        JSON.stringify({
          ...base,
          documents: { 'a.md': { lines: ['secret'] } },
        }),
        root,
      ),
    ).toBeNull()
    expect(parseWorkspaceIndexCachePayload(`{"lines":[],"cacheSchemaVersion":${CACHE_SCHEMA_VERSION}}`, root)).toBeNull()
  })
})

describe('workspace-index-cache：文件存储', () => {
  let cacheDir = ''
  const lifecycles = new Map<string, number>()

  afterEach(async () => {
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true })
    cacheDir = ''
    lifecycles.clear()
  })

  const createStore = () =>
    createFileWorkspaceIndexCache(
      () => cacheDir,
      (root) => lifecycles.get(root) ?? 0,
    )

  it('round-trip 不含正文且按 lifecycle 拒绝迟到写入', async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'paperin-cache-'))
    const store = createStore()
    const root = 'D:/notes'
    lifecycles.set(root, 0)
    const marker = 'paperin_body_must_not_persist'
    const index: WorkspaceIndex = {
      ...sampleIndex(root),
      documents: {
        'D:/notes/a.md': {
          path: 'D:/notes/a.md',
          relativePath: 'a.md',
          name: 'a.md',
          size: 10,
          modifiedTime: 1,
          headings: [{ level: 1, text: 'A', line: 1 }],
          tags: [],
          frontmatter: {},
          outgoingLinks: [],
          imageRefs: [],
        },
      },
    }

    await store.save(root, index, { lifecycleEpoch: 0 })
    const loaded = await store.load(root)
    expect(loaded?.generation).toBe(1)
    const serialized = JSON.stringify(loaded)
    expect(serialized).not.toContain('"lines"')
    expect(serialized).not.toContain('"content"')
    expect(serialized).not.toContain(marker)

    lifecycles.set(root, 1)
    await store.save(root, { ...index, generation: 99 }, { lifecycleEpoch: 0 })
    expect((await store.load(root))?.generation).toBe(1)
  })

  it('中文 UTF-8 超 8 MiB、截断 JSON 与加载时被替换回退 null', async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'paperin-cache-'))
    const store = createStore()
    const root = 'D:/notes'
    lifecycles.set(root, 0)
    const { createHash } = await import('crypto')
    const file = join(cacheDir, `${createHash('sha1').update(root).digest('hex')}.json`)
    await mkdir(cacheDir, { recursive: true })

    await writeFile(file, Buffer.alloc(MAX_CACHE_FILE_BYTES + 1, 0x61))
    expect(await store.load(root)).toBeNull()

    await writeFile(file, '{"cacheSchemaVersion":1,"workspacePath":"D:/notes","documents":', 'utf-8')
    expect(await store.load(root)).toBeNull()

    await store.save(root, sampleIndex(root), { lifecycleEpoch: 0 })
    const truncated = (await readFile(file)).subarray(0, 40)
    await writeFile(file, truncated)
    expect(await store.load(root)).toBeNull()
  })

  it('clear 后 load 返回 null', async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'paperin-cache-'))
    const store = createStore()
    const root = 'D:/notes'
    lifecycles.set(root, 0)
    await store.save(root, sampleIndex(root), { lifecycleEpoch: 0 })
    await store.clear(root)
    expect(await store.load(root)).toBeNull()
  })
})
