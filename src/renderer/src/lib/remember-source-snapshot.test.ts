import { describe, expect, it } from 'vitest'
import { DEFAULT_WORKSPACE_SETTINGS } from '../../../shared/workspace-state'
import {
  mergeSourceSnapshotIntoSettings,
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

describe('mergeSourceSnapshotIntoSettings', () => {
  it('把相对路径与 mtime 写入 sourceSnapshots', () => {
    const next = mergeSourceSnapshotIntoSettings(DEFAULT_WORKSPACE_SETTINGS, '资料/a.md', 42)
    expect(next.editor.sourceSnapshots).toEqual([{ path: '资料/a.md', modifiedTime: 42 }])
  })
})
