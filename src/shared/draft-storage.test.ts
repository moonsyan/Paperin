import { describe, expect, it } from 'vitest'
import {
  canUpsertDraft,
  filterDraftsForSession,
  normalizeStoredDraft,
} from './draft-storage'

describe('canUpsertDraft', () => {
  it('空槽位允许写入', () => {
    expect(canUpsertDraft(undefined, 'sess-a')).toEqual({ allow: true })
  })

  it('同会话可更新已有草稿', () => {
    const existing = { content: 'a', savedAt: 1, draftSessionId: 'sess-a' }
    expect(canUpsertDraft(existing, 'sess-a')).toEqual({ allow: true })
  })

  it('两窗口同路径：其他会话写入被拒绝', () => {
    const existing = { content: 'a', savedAt: 1, draftSessionId: 'sess-a' }
    expect(canUpsertDraft(existing, 'sess-b')).toEqual({
      allow: false,
      reason: 'SESSION_CONFLICT',
    })
  })

  it('遗留草稿可被带 sessionId 的首次写入认领', () => {
    const legacy = { content: 'old', savedAt: 1 }
    expect(canUpsertDraft(legacy, 'sess-a')).toEqual({ allow: true })
  })
})

describe('filterDraftsForSession', () => {
  it('只保留本会话与无 sessionId 的遗留草稿', () => {
    const all = {
      a: { content: '1', savedAt: 1, draftSessionId: 'mine' },
      b: { content: '2', savedAt: 2, draftSessionId: 'other' },
      c: { content: '3', savedAt: 3 },
    }
    expect(filterDraftsForSession(all, 'mine')).toEqual({
      a: all.a,
      c: all.c,
    })
  })
})

describe('normalizeStoredDraft', () => {
  it('缺字段的遗留对象仍保留正文', () => {
    expect(normalizeStoredDraft({ content: 'x', savedAt: 10 })).toEqual({
      content: 'x',
      savedAt: 10,
    })
  })
})
