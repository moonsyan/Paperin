import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKSPACE_SETTINGS } from '../../../shared/workspace-state'
import {
  mergeDocumentSourceBaselineIntoSettings,
  searchQueryForRelocate,
  sourceRegistrationTicketMatches,
} from './remember-source-snapshot'

describe('searchQueryForRelocate', () => {
  it('只用文件名做搜索词，不猜测新目录', () => {
    expect(searchQueryForRelocate('资料/缓存失效策略.md')).toBe('缓存失效策略')
    expect(searchQueryForRelocate('归档\\同名.md')).toBe('同名')
  })
})

describe('sourceRegistrationTicketMatches', () => {
  it('epoch 或 recordVersion 任一变化则票据失效', () => {
    const captured = { workspaceEpoch: 2, recordVersion: 1 }
    expect(sourceRegistrationTicketMatches(captured, { workspaceEpoch: 2, recordVersion: 1 })).toBe(true)
    expect(sourceRegistrationTicketMatches(captured, { workspaceEpoch: 3, recordVersion: 1 })).toBe(false)
    expect(sourceRegistrationTicketMatches(captured, { workspaceEpoch: 2, recordVersion: 2 })).toBe(false)
  })

  it('A→B→A 不能仅靠路径相同视为同一生命周期', () => {
    const firstVisit = { workspaceEpoch: 1, recordVersion: 0 }
    const afterReturnToSamePath = { workspaceEpoch: 3, recordVersion: 0 }
    expect(sourceRegistrationTicketMatches(firstVisit, afterReturnToSamePath)).toBe(false)
  })
})

describe('mergeDocumentSourceBaselineIntoSettings', () => {
  it('把引用文档、来源路径与 mtime 写入 documentSourceBaselines', () => {
    const next = mergeDocumentSourceBaselineIntoSettings(
      DEFAULT_WORKSPACE_SETTINGS,
      '文章/a.md',
      '资料/a.md',
      42,
    )
    expect(next.editor.documentSourceBaselines).toEqual([
      { citingDocumentPath: '文章/a.md', sourcePath: '资料/a.md', modifiedTime: 42 },
    ])
  })
})
