import { describe, expect, it } from 'vitest'
import { createInitialWorkspaceCoverage } from '../../../shared/workspace-coverage'
import type { IndexedDocument, WorkspaceIndex } from '../../../shared/workspace-index'
import {
  buildReviewInputsFromIndex,
  evaluateCurrentDocumentSourceHealth,
  evaluateSourceHealth,
} from './source-health'

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

const completeIndexWith = (
  documents: Record<string, IndexedDocument>,
): WorkspaceIndex => ({
  workspacePath: '/ws',
  generatedAt: '2026-01-01T00:00:00.000Z',
  generation: 1,
  complete: true,
  truncated: false,
  coverage: createInitialWorkspaceCoverage(),
  documents,
  links: [],
  tags: [],
  assets: [],
  diagnostics: [],
})

describe('evaluateSourceHealth', () => {
  it('mtime 一致为 current，变化为 changed，目标消失为 missing', () => {
    const index = completeIndexWith({ '/ws/资料/a.md': documentAt('资料/a.md', 10) })
    expect(evaluateSourceHealth(
      [{ citingDocumentPath: '文章/x.md', sourcePath: '资料/a.md', modifiedTime: 10 }],
      index,
    )).toEqual([{ path: '资料/a.md', status: 'current', scope: 'current-document' }])
    expect(evaluateSourceHealth(
      [{ citingDocumentPath: '文章/x.md', sourcePath: '资料/a.md', modifiedTime: 10 }],
      completeIndexWith({ '/ws/资料/a.md': documentAt('资料/a.md', 20) }),
    )).toEqual([{ path: '资料/a.md', status: 'changed', scope: 'current-document' }])
    expect(evaluateSourceHealth(
      [{ citingDocumentPath: '文章/x.md', sourcePath: '资料/a.md', modifiedTime: 10 }],
      completeIndexWith({ '/ws/资料/b.md': documentAt('资料/b.md', 10) }),
    )).toEqual([{ path: '资料/a.md', status: 'missing', scope: 'current-document' }])
  })

  it('legacy 记录标记为 legacy-unknown 范围', () => {
    const index = completeIndexWith({ '/ws/资料/a.md': documentAt('资料/a.md', 10) })
    expect(evaluateSourceHealth([], index, {
      legacySnapshots: [{ path: '资料/a.md', modifiedTime: 10 }],
    })).toEqual([{ path: '资料/a.md', status: 'current', scope: 'legacy-unknown' }])
  })

  it('索引未完成或截断时一律 unverified，不把同名不同目录当成命中', () => {
    const index = completeIndexWith({ '/ws/资料/a.md': documentAt('资料/a.md', 10) })
    expect(evaluateSourceHealth(
      [{ citingDocumentPath: '文章/x.md', sourcePath: '资料/a.md', modifiedTime: 10 }],
      { ...index, complete: false },
    )).toEqual([{ path: '资料/a.md', status: 'unverified', scope: 'current-document' }])
    expect(evaluateSourceHealth(
      [{ citingDocumentPath: '文章/x.md', sourcePath: '资料/a.md', modifiedTime: 10 }],
      { ...index, truncated: true },
    )).toEqual([{ path: '资料/a.md', status: 'unverified', scope: 'current-document' }])
    expect(evaluateSourceHealth(
      [{ citingDocumentPath: '文章/x.md', sourcePath: '资料/a.md', modifiedTime: 10 }],
      null,
    )).toEqual([{ path: '资料/a.md', status: 'unverified', scope: 'current-document' }])
    expect(evaluateSourceHealth(
      [{ citingDocumentPath: '文章/x.md', sourcePath: '资料/a.md', modifiedTime: 10 }],
      completeIndexWith({ '/ws/归档/a.md': documentAt('归档/a.md', 10) }),
    )).toEqual([{ path: '资料/a.md', status: 'missing', scope: 'current-document' }])
  })
})

describe('evaluateCurrentDocumentSourceHealth', () => {
  it('A@10 与 B@20 时切换文档只看各自来源', () => {
    const index = completeIndexWith({ '/ws/资料/s.md': documentAt('资料/s.md', 20) })
    const baselines = [
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 10 },
      { citingDocumentPath: '文章/b.md', sourcePath: '资料/s.md', modifiedTime: 20 },
    ]
    expect(evaluateCurrentDocumentSourceHealth(baselines, '文章/a.md', false, index)).toEqual([
      { path: '资料/s.md', status: 'changed', scope: 'current-document' },
    ])
    expect(evaluateCurrentDocumentSourceHealth(baselines, '文章/b.md', false, index)).toEqual([
      { path: '资料/s.md', status: 'current', scope: 'current-document' },
    ])
  })
})

describe('buildReviewInputsFromIndex', () => {
  it('复核输入来自索引当前 mtime', () => {
    const index = completeIndexWith({ '/ws/资料/s.md': documentAt('资料/s.md', 88) })
    expect(buildReviewInputsFromIndex(
      [{ citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 10 }],
      '文章/a.md',
      false,
      index,
    )).toEqual([{ sourcePath: '资料/s.md', modifiedTime: 88 }])
  })
})
