import { describe, expect, it } from 'vitest'
import type { IndexedDocument, WorkspaceIndex } from '../../../shared/workspace-index'
import { createInitialWorkspaceCoverage } from '../../../shared/workspace-coverage'
import { collectDiagnostics, parseStructuredQuery, searchStructuredIndex } from './diagnostics'

const document = (overrides: Partial<IndexedDocument> = {}): IndexedDocument => ({
  path: 'D:/notes/a.md',
  relativePath: 'a.md',
  name: 'a.md',
  size: 1,
  modifiedTime: 0,
  headings: [],
  tags: [],
  frontmatter: {},
  outgoingLinks: [],
  imageRefs: [],
  ...overrides,
})

const index = (documents: Record<string, IndexedDocument>): WorkspaceIndex => ({
  workspacePath: 'D:/notes',
  generatedAt: new Date(0).toISOString(),
  generation: 3,
  complete: true,
  truncated: false,
  coverage: createInitialWorkspaceCoverage(),
  documents,
  links: Object.values(documents).flatMap((item) => item.outgoingLinks),
  tags: [],
  assets: [],
  diagnostics: [],
})

describe('collectDiagnostics', () => {
  it('reports broken links and missing assets with path and line', () => {
    const doc = document({
      outgoingLinks: [{ sourcePath: 'D:/notes/a.md', target: 'missing.md', line: 4, kind: 'md' }],
      imageRefs: [{ sourcePath: 'D:/notes/a.md', target: 'missing.png', line: 5 }],
    })
    const diagnostics = collectDiagnostics(index({ [doc.path]: doc }))
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'BROKEN_LINK', severity: 'warning', path: doc.path, line: 4 }),
      expect.objectContaining({ code: 'MISSING_ASSET', severity: 'error', path: doc.path, line: 5 }),
    ]))
  })

  it('reports empty and duplicate headings', () => {
    const doc = document({ headings: [
      { level: 1, text: '', line: 1 },
      { level: 1, text: '重复', line: 2 },
      { level: 2, text: '重复', line: 7 },
    ] })
    const diagnostics = collectDiagnostics(index({ [doc.path]: doc }))
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EMPTY_HEADING', line: 1 }),
      expect.objectContaining({ code: 'DUPLICATE_HEADING', line: 7, target: '重复' }),
    ]))
  })

  it('reports unresolved wiki links and orphan markdown documents', () => {
    const a = document({
      outgoingLinks: [{ sourcePath: 'D:/notes/a.md', target: 'Ghost', line: 3, kind: 'wiki' }],
    })
    const b = document({ path: 'D:/notes/b.md', relativePath: 'b.md', name: 'b.md' })
    const diagnostics = collectDiagnostics(index({ [a.path]: a, [b.path]: b }))
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'UNRESOLVED_WIKI', path: a.path, line: 3 }),
      expect.objectContaining({ code: 'ORPHAN_DOCUMENT', severity: 'info', path: b.path }),
    ]))
  })

  it('does not report a document with an incoming resolved link as orphan', () => {
    const a = document({ outgoingLinks: [{ sourcePath: 'D:/notes/a.md', target: 'b.md', line: 1, kind: 'md', resolvedPath: 'D:/notes/b.md' }] })
    const b = document({ path: 'D:/notes/b.md', relativePath: 'b.md', name: 'b.md' })
    expect(collectDiagnostics(index({ [a.path]: a, [b.path]: b })).some((d) => d.code === 'ORPHAN_DOCUMENT' && d.path === b.path)).toBe(false)
  })

  it('reports footnote references without definitions', () => {
    const doc = document({ footnoteRefs: [{ label: '注释', line: 1 }], footnoteDefinitions: ['其他'] })
    expect(collectDiagnostics(index({ [doc.path]: doc })).some((d) => d.code === 'FOOTNOTE_ERROR' && d.line === 1)).toBe(true)
  })
})

describe('parseStructuredQuery', () => {
  it('parses supported predicates', () => {
    expect(parseStructuredQuery('tag:work path:docs/ link:guide is:孤立 has:image')).toEqual({
      tags: ['work'],
      path: 'docs/',
      link: 'guide',
      isOrphan: true,
      hasImage: true,
    })
  })

  it('supports quoted values and rejects unknown syntax', () => {
    expect(parseStructuredQuery('tag:"项目 管理"')).toEqual({ tags: ['项目 管理'] })
    expect(() => parseStructuredQuery('unknown:value')).toThrow('不支持的查询语法')
  })

  it('searches indexed documents and returns generation', () => {
    const doc = document({ tags: ['work'], relativePath: 'docs/a.md', imageRefs: [{ sourcePath: 'D:/notes/a.md', target: 'x.png', line: 2 }] })
    const result = searchStructuredIndex(index({ [doc.path]: doc }), 'tag:work has:image')
    expect(result[0]).toMatchObject({ path: doc.path, generation: 3 })
  })
})
