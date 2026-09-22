import { cp, mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it, beforeAll } from 'vitest'
import { createWorkspaceIndexService } from '../../../indexing/workspace-index-service'
import { createWorkspaceIndexFilesystemDependencies } from '../../../indexing/workspace-index-filesystem'
import { assertRelativePathWithinRoot } from './fixture-paths'
import { hashCompatibilityFixtureTree } from './compatibility-hash'
import {
  COMPATIBILITY_FIXTURE_ROOT,
  materializeCompatibilityFixtures,
  resolveCompatibilityManifests,
  validateManifestCounts,
} from './materialize'
import { MIN_DOCUMENTS_PER_SOURCE } from './manifest'
import { summarizeCompatibilityOpen } from './compatibility-diagnostics'

describe('常见来源兼容合成夹具', () => {
  beforeAll(async () => {
    await materializeCompatibilityFixtures()
    validateManifestCounts()
  })

  it('manifest 每类至少 10 篇且路径均在夹具根内', () => {
    const manifests = resolveCompatibilityManifests()
    expect(manifests).toHaveLength(5)
    for (const manifest of manifests) {
      const markdownCount = manifest.documents.filter((path) => path.endsWith('.md')).length
      expect(markdownCount, manifest.source).toBeGreaterThanOrEqual(MIN_DOCUMENTS_PER_SOURCE)
      for (const docPath of manifest.documents) {
        expect(() => assertRelativePathWithinRoot(COMPATIBILITY_FIXTURE_ROOT, docPath)).not.toThrow()
      }
    }
  })

  it('覆盖 frontmatter、Wiki 链接、相对图片、中文路径、未知语法与缺附件', async () => {
    const manifests = resolveCompatibilityManifests()
    const combined = manifests.flatMap((item) => item.documents)
    expect(combined.some((path) => path.includes('中文路径'))).toBe(true)
    expect(combined.some((path) => path.endsWith('.csv'))).toBe(true)
    expect(combined.some((path) => path.endsWith('.png'))).toBe(true)

    const obsidian = manifests.find((item) => item.source === 'obsidian')
    expect(obsidian?.expectedUnsupported).toContain('obsidian-callout')

    const samplePaths = [
      'markdown/doc-01.md',
      'markdown/doc-02.md',
      'markdown/doc-03.md',
      'obsidian/doc-07.md',
      'notion/doc-08.md',
      '中文路径/标准样本.md',
    ]
    const { readFile } = await import('fs/promises')
    for (const relative of samplePaths) {
      const text = await readFile(join(COMPATIBILITY_FIXTURE_ROOT, relative), 'utf8')
      if (relative.endsWith('doc-01.md')) expect(text).toContain('---\ntitle:')
      if (relative.endsWith('doc-02.md')) expect(text).toContain('[[')
      if (relative.endsWith('doc-03.md')) expect(text).toContain('missing-attachment')
      if (relative.includes('中文路径')) expect(text).toContain('COMPAT_CHINESE_PATH')
      if (relative.includes('obsidian/doc-07')) expect(text).toContain('[!note]')
      if (relative.includes('notion/doc-08')) expect(text).toContain('{{database')
    }
  })

  it('只读索引后 Markdown/附件 hash 不变', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'paperin-compat-'))
    const service = createWorkspaceIndexService(createWorkspaceIndexFilesystemDependencies())
    try {
      await cp(COMPATIBILITY_FIXTURE_ROOT, tempRoot, { recursive: true })
      const before = await hashCompatibilityFixtureTree(tempRoot)

      const result = await service.refresh(tempRoot)
      expect(Object.keys(result.index.documents).length).toBeGreaterThan(0)
      const index = result.index

      const after = await hashCompatibilityFixtureTree(tempRoot)
      expect(after).toEqual(before)

      for (const manifest of resolveCompatibilityManifests()) {
        const summary = summarizeCompatibilityOpen(manifest, index)
        expect(summary.expectedUnsupported).toEqual(manifest.expectedUnsupported)
        expect(JSON.stringify(summary)).not.toMatch(/Users[/\\]|\\\\|\/home\//)
      }
    } finally {
      service.dispose(tempRoot)
      await rm(tempRoot, { recursive: true, force: true })
    }
  })
})
