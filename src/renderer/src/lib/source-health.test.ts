import { describe, expect, it } from 'vitest'
import { createInitialWorkspaceCoverage } from '../../../shared/workspace-coverage'
import type { IndexedDocument, WorkspaceIndex } from '../../../shared/workspace-index'
import { evaluateSourceHealth } from './source-health'

const documentAt = (relativePath: string, modifiedTime: number): IndexedDocument => ({
  path: `/ws/${relativePath}`,
  relativePath,
  name: relativePath.split('/').pop() ?? relativePath,
  size: 12,
  modifiedTime,
  headings: [],
  tags: [],
  frontmatter: {},
  outgoingLinks: [],
  imageRefs: [],
})

const completeIndexWith = (relativePath: string, modifiedTime: number): WorkspaceIndex => ({
  workspacePath: '/ws',
  generatedAt: '2026-01-01T00:00:00.000Z',
  generation: 1,
  complete: true,
  truncated: false,
  coverage: createInitialWorkspaceCoverage(),
  documents: { [`/ws/${relativePath}`]: documentAt(relativePath, modifiedTime) },
  links: [],
  tags: [],
  assets: [],
  diagnostics: [],
})

describe('evaluateSourceHealth', () => {
  it('mtime 一致为 current，变化为 changed，目标消失为 missing', () => {
    expect(evaluateSourceHealth(
      [{ path: '资料/a.md', modifiedTime: 10 }],
      completeIndexWith('资料/a.md', 10),
    )).toEqual([{ path: '资料/a.md', status: 'current' }])
    expect(evaluateSourceHealth(
      [{ path: '资料/a.md', modifiedTime: 10 }],
      completeIndexWith('资料/a.md', 20),
    )).toEqual([{ path: '资料/a.md', status: 'changed' }])
    expect(evaluateSourceHealth(
      [{ path: '资料/a.md', modifiedTime: 10 }],
      completeIndexWith('资料/b.md', 10),
    )).toEqual([{ path: '资料/a.md', status: 'missing' }])
  })

  it('索引未完成或截断时一律 unverified，不把同名不同目录当成命中', () => {
    const incomplete = completeIndexWith('资料/a.md', 10)
    expect(evaluateSourceHealth(
      [{ path: '资料/a.md', modifiedTime: 10 }],
      { ...incomplete, complete: false },
    )).toEqual([{ path: '资料/a.md', status: 'unverified' }])
    expect(evaluateSourceHealth(
      [{ path: '资料/a.md', modifiedTime: 10 }],
      { ...incomplete, truncated: true },
    )).toEqual([{ path: '资料/a.md', status: 'unverified' }])
    expect(evaluateSourceHealth(
      [{ path: '资料/a.md', modifiedTime: 10 }],
      null,
    )).toEqual([{ path: '资料/a.md', status: 'unverified' }])
    expect(evaluateSourceHealth(
      [{ path: '资料/a.md', modifiedTime: 10 }],
      completeIndexWith('归档/a.md', 10),
    )).toEqual([{ path: '资料/a.md', status: 'missing' }])
  })
})
