import { describe, expect, it } from 'vitest'
import {
  MAX_LEGACY_SOURCE_SNAPSHOTS,
  MAX_SOURCE_BASELINES_PER_DOCUMENT,
  MAX_TOTAL_DOCUMENT_SOURCE_BASELINES,
  baselinesForCitingDocument,
  clearAllSourceRelations,
  ephemeralCitingDocumentKey,
  parseSourceTrackingFromEditor,
  rebindEphemeralCitingDocument,
  rememberDocumentSourceBaseline,
  remapSourceTrackingPath,
  reviewCitingDocumentBaselines,
  relocateCitingDocumentSourceBaseline,
} from './source-tracking'

describe('parseSourceTrackingFromEditor', () => {
  it('旧 sourceSnapshots 迁移为 legacy，不生成 documentSourceBaselines', () => {
    const parsed = parseSourceTrackingFromEditor({
      sourceSnapshots: [
        { path: '资料/a.md', modifiedTime: 10, content: '丢弃' },
        { path: '资料/b.md', modifiedTime: 20 },
      ],
      documentSourceBaselines: [],
    })
    expect(parsed.documentSourceBaselines).toEqual([])
    expect(parsed.legacySourceSnapshots).toEqual([
      { path: '资料/a.md', modifiedTime: 10 },
      { path: '资料/b.md', modifiedTime: 20 },
    ])
  })

  it('拒绝绝对路径与未保存 citing 路径进入持久化解析结果', () => {
    const parsed = parseSourceTrackingFromEditor({
      documentSourceBaselines: [
        {
          citingDocumentPath: ephemeralCitingDocumentKey('draft-1'),
          sourcePath: '资料/s.md',
          modifiedTime: 1,
        },
        {
          citingDocumentPath: '文章/a.md',
          sourcePath: 'C:/evil.md',
          modifiedTime: 2,
        },
        {
          citingDocumentPath: '文章/a.md',
          sourcePath: '资料/s.md',
          modifiedTime: 3,
        },
      ],
    })
    expect(parsed.documentSourceBaselines).toEqual([
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 3 },
    ])
  })
})

describe('relocateCitingDocumentSourceBaseline', () => {
  it('只更新所选引用文档的来源路径，不影响其他文章', () => {
    const current = [
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/旧.md', modifiedTime: 1 },
      { citingDocumentPath: '文章/b.md', sourcePath: '资料/旧.md', modifiedTime: 9 },
    ]
    const next = relocateCitingDocumentSourceBaseline(
      current,
      '文章/a.md',
      '资料/旧.md',
      '资料/新.md',
      50,
      false,
    )
    expect(baselinesForCitingDocument(next, '文章/b.md', false)).toEqual([
      { citingDocumentPath: '文章/b.md', sourcePath: '资料/旧.md', modifiedTime: 9 },
    ])
    expect(baselinesForCitingDocument(next, '文章/a.md', false)).toEqual([
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/新.md', modifiedTime: 50 },
    ])
  })
})

describe('rememberDocumentSourceBaseline', () => {
  it('A@10 与 B@20 对同一来源互不影响', () => {
    let baselines = rememberDocumentSourceBaseline([], {
      citingDocumentPath: '文章/a.md',
      sourcePath: '资料/s.md',
      modifiedTime: 10,
    })
    baselines = rememberDocumentSourceBaseline(baselines, {
      citingDocumentPath: '文章/b.md',
      sourcePath: '资料/s.md',
      modifiedTime: 20,
    })
    expect(baselinesForCitingDocument(baselines, '文章/a.md', false)).toEqual([
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 10 },
    ])
    expect(baselinesForCitingDocument(baselines, '文章/b.md', false)).toEqual([
      { citingDocumentPath: '文章/b.md', sourcePath: '资料/s.md', modifiedTime: 20 },
    ])
  })

  it('同一文章重复登记同一来源会更新基线', () => {
    const baselines = rememberDocumentSourceBaseline(
      [{ citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 10 }],
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 15 },
    )
    expect(baselines).toEqual([
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 15 },
    ])
  })
})

describe('reviewCitingDocumentBaselines', () => {
  it('只更新所选文档基线', () => {
    const current = [
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 10 },
      { citingDocumentPath: '文章/b.md', sourcePath: '资料/s.md', modifiedTime: 20 },
    ]
    const reviewed = reviewCitingDocumentBaselines(
      current,
      '文章/a.md',
      [{ sourcePath: '资料/s.md', modifiedTime: 99 }],
      false,
    )
    expect(reviewed).toEqual([
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 99 },
      { citingDocumentPath: '文章/b.md', sourcePath: '资料/s.md', modifiedTime: 20 },
    ])
  })
})

describe('rebindEphemeralCitingDocument', () => {
  it('另存为后把未保存 citing 键绑定到相对路径', () => {
    const ephemeral = ephemeralCitingDocumentKey('draft-1')
    const rebound = rebindEphemeralCitingDocument(
      [{ citingDocumentPath: ephemeral, sourcePath: '资料/s.md', modifiedTime: 5 }],
      'draft-1',
      '文章/new.md',
    )
    expect(rebound).toEqual([
      { citingDocumentPath: '文章/new.md', sourcePath: '资料/s.md', modifiedTime: 5 },
    ])
  })
})

describe('remapSourceTrackingPath', () => {
  it('引用文档或来源改名/移动时同步更新路径', () => {
    const slice = {
      documentSourceBaselines: [
        { citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 1 },
      ],
      legacySourceSnapshots: [{ path: '资料/s.md', modifiedTime: 2 }],
    }
    const remapped = remapSourceTrackingPath(slice, '资料/s.md', '归档/s.md', true)
    expect(remapped.documentSourceBaselines[0]?.sourcePath).toBe('归档/s.md')
    expect(remapped.legacySourceSnapshots[0]?.path).toBe('归档/s.md')
  })
})

describe('clearAllSourceRelations', () => {
  it('删除来源关系不影响导航字段（由调用方负责）', () => {
    const cleared = clearAllSourceRelations({
      documentSourceBaselines: [
        { citingDocumentPath: '文章/a.md', sourcePath: '资料/s.md', modifiedTime: 1 },
      ],
      legacySourceSnapshots: [{ path: '资料/s.md', modifiedTime: 2 }],
    })
    expect(cleared).toEqual({ documentSourceBaselines: [], legacySourceSnapshots: [] })
  })
})

describe('配额裁剪', () => {
  it('超出总量上限时丢弃最旧项而不是静默判为健康', () => {
    const overflow = Array.from({ length: 10 * 25 }, (_, index) => ({
      citingDocumentPath: `文章/${Math.floor(index / 25)}.md`,
      sourcePath: `资料/s-${index}.md`,
      modifiedTime: index,
    }))
    const parsed = parseSourceTrackingFromEditor({ documentSourceBaselines: overflow.reverse() })
    expect(parsed.documentSourceBaselines.length).toBe(MAX_TOTAL_DOCUMENT_SOURCE_BASELINES)
    expect(parsed.documentSourceBaselines.some((item) => item.modifiedTime >= 250)).toBe(false)
  })

  it('legacy 仍受 50 条上限约束', () => {
    const legacy = Array.from({ length: MAX_LEGACY_SOURCE_SNAPSHOTS + 3 }, (_, index) => ({
      path: `资料/${index}.md`,
      modifiedTime: index,
    }))
    expect(parseSourceTrackingFromEditor({ legacySourceSnapshots: legacy }).legacySourceSnapshots)
      .toHaveLength(MAX_LEGACY_SOURCE_SNAPSHOTS)
  })

  it('单文档来源数受 per-document 上限约束', () => {
    const manySources = Array.from({ length: MAX_SOURCE_BASELINES_PER_DOCUMENT + 5 }, (_, index) => ({
      citingDocumentPath: '文章/a.md',
      sourcePath: `资料/s-${index}.md`,
      modifiedTime: index,
    }))
    const trimmed = parseSourceTrackingFromEditor({ documentSourceBaselines: manySources.reverse() })
    expect(trimmed.documentSourceBaselines.filter((item) => item.citingDocumentPath === '文章/a.md'))
      .toHaveLength(MAX_SOURCE_BASELINES_PER_DOCUMENT)
  })
})
