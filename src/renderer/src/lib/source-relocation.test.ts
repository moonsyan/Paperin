import { describe, expect, it } from 'vitest'
import { createInitialWorkspaceCoverage } from '../../../shared/workspace-coverage'
import type { IndexedDocument, WorkspaceIndex } from '../../../shared/workspace-index'
import {
  applyPlainMarkdownLinkUpdates,
  applySourceRelocationToSettings,
  listSameBasenameRelocationCandidates,
  planPlainMarkdownLinkUpdates,
  requiresExplicitCandidateSelection,
  resolveRelocationCandidate,
  sourceRelocationBindingMatches,
  type SourceRelocationBinding,
} from './source-relocation'
import { parseWorkspaceSettings } from '../../../shared/workspace-state'

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

const indexWithSameNames = (): WorkspaceIndex => ({
  workspacePath: '/ws',
  generatedAt: '2026-01-01T00:00:00.000Z',
  generation: 1,
  complete: true,
  truncated: false,
  coverage: createInitialWorkspaceCoverage(),
  documents: {
    '/ws/资料/同名.md': documentAt('资料/同名.md', 10),
    '/ws/归档/同名.md': documentAt('归档/同名.md', 20),
    '/ws/资料/旧路径.md': documentAt('资料/旧路径.md', 30),
  },
  links: [],
  tags: [],
  assets: [],
  diagnostics: [],
})

describe('listSameBasenameRelocationCandidates', () => {
  it('列出除 previous 外所有同名文件', () => {
    const candidates = listSameBasenameRelocationCandidates(indexWithSameNames(), '资料/旧路径.md')
    expect(candidates).toEqual([])
    const same = listSameBasenameRelocationCandidates(indexWithSameNames(), '资料/同名.md')
    expect(same).toEqual([{ relativePath: '归档/同名.md', modifiedTime: 20 }])
  })
})

describe('resolveRelocationCandidate', () => {
  it('同名多候选未选择时要求用户选择', () => {
    const candidates = listSameBasenameRelocationCandidates(indexWithSameNames(), '资料/同名.md')
    expect(requiresExplicitCandidateSelection(candidates)).toBe(false)
    const both = [
      { relativePath: '资料/同名.md', modifiedTime: 10 },
      { relativePath: '归档/同名.md', modifiedTime: 20 },
    ]
    expect(requiresExplicitCandidateSelection(both)).toBe(true)
    expect(resolveRelocationCandidate(both, null, false)).toEqual({ ok: false, reason: 'needs-selection' })
    expect(resolveRelocationCandidate(both, '归档/同名.md', false)).toEqual({
      ok: true,
      candidate: { relativePath: '归档/同名.md', modifiedTime: 20 },
    })
  })
})

describe('applySourceRelocationToSettings', () => {
  const binding: SourceRelocationBinding = {
    citingDocumentKey: '文章/a.md',
    ticket: { workspaceEpoch: 1, recordVersion: 0 },
  }

  it('取消或票据不匹配时不改设置', () => {
    const base = parseWorkspaceSettings({})
    const withBaseline = {
      ...base,
      editor: {
        ...base.editor,
        documentSourceBaselines: [
          { citingDocumentPath: '文章/a.md', sourcePath: '资料/旧.md', modifiedTime: 1 },
          { citingDocumentPath: '文章/b.md', sourcePath: '资料/旧.md', modifiedTime: 9 },
        ],
      },
    }
    expect(
      applySourceRelocationToSettings(
        withBaseline,
        binding,
        { citingDocumentKey: '文章/x.md', ticket: binding.ticket },
        {
          previousPath: '资料/旧.md',
          selectedPath: '资料/新.md',
          selectedModifiedTime: 50,
          updateMarkdownLink: false,
        },
        false,
      ),
    ).toBeNull()
  })

  it('默认只更新当前引用文档的来源基线，不改正文', () => {
    const base = parseWorkspaceSettings({})
    const withBaseline = {
      ...base,
      editor: {
        ...base.editor,
        documentSourceBaselines: [
          { citingDocumentPath: '文章/a.md', sourcePath: '资料/旧.md', modifiedTime: 1 },
          { citingDocumentPath: '文章/b.md', sourcePath: '资料/旧.md', modifiedTime: 9 },
        ],
      },
    }
    const next = applySourceRelocationToSettings(
      withBaseline,
      binding,
      binding,
      {
        previousPath: '资料/旧.md',
        selectedPath: '资料/新.md',
        selectedModifiedTime: 50,
        updateMarkdownLink: false,
      },
      false,
    )
    expect(next?.editor.documentSourceBaselines).toEqual([
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/新.md', modifiedTime: 50 },
      { citingDocumentPath: '文章/b.md', sourcePath: '资料/旧.md', modifiedTime: 9 },
    ])
  })
})

describe('planPlainMarkdownLinkUpdates', () => {
  it('勾选更新链接时先给出替换前后，且只改普通 Markdown 链接', () => {
    const markdown = [
      '见 [旧链](../资料/旧.md) 与 !图(../资料/旧.md)',
      'Wiki [[资料/旧]] 保留',
      '`[码内](../资料/旧.md)` 跳过',
    ].join('\n')
    const replacements = planPlainMarkdownLinkUpdates(
      markdown,
      '文章/草稿.md',
      '资料/旧.md',
      '资料/新.md',
      false,
    )
    expect(replacements).toHaveLength(1)
    expect(replacements[0]?.before).toContain('../资料/旧.md')
    expect(replacements[0]?.after).toContain('%E6%96%B0.md')
    const updated = applyPlainMarkdownLinkUpdates(markdown, replacements)
    expect(updated).toContain('%E6%96%B0.md')
    expect(updated).toContain('Wiki [[资料/旧]]')
    expect(updated).toContain('!图(../资料/旧.md)')
  })
})

describe('sourceRelocationBindingMatches', () => {
  it('引用文档或工作区生命周期变化则拒绝提交', () => {
    const left: SourceRelocationBinding = {
      citingDocumentKey: '文章/a.md',
      ticket: { workspaceEpoch: 1, recordVersion: 0 },
    }
    expect(
      sourceRelocationBindingMatches(left, {
        citingDocumentKey: '文章/a.md',
        ticket: { workspaceEpoch: 2, recordVersion: 0 },
      }),
    ).toBe(false)
    expect(
      sourceRelocationBindingMatches(left, {
        citingDocumentKey: '文章/a.md',
        ticket: { workspaceEpoch: 1, recordVersion: 0 },
      }),
    ).toBe(true)
  })
})
