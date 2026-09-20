/** 主进程 settings.drafts 中单篇草稿的结构（与渲染层 DraftRecord 对齐）。 */
export interface StoredDraft {
  content: string
  savedAt: number
  /** 起草时磁盘正文的 SHA-256（R02 版本绑定）；缺失时恢复走 mtime 启发式。 */
  baselineSha256?: string
  /** 写入该草稿的窗口会话；缺失表示升级前遗留草稿。 */
  draftSessionId?: string
}

export type DraftUpsertDecision =
  | { allow: true }
  | { allow: false; reason: 'SESSION_CONFLICT' }

/**
 * 是否允许本次 upsert 覆盖已有草稿。
 * 遗留无 draftSessionId 的条目仅能被首次带 sessionId 的写入认领；
 * 认领后其他会话不得覆盖。
 */
export const canUpsertDraft = (
  existing: StoredDraft | undefined,
  incomingSessionId: string | undefined,
): DraftUpsertDecision => {
  if (!existing) return { allow: true }
  const owner = existing.draftSessionId
  if (!owner) {
    if (!incomingSessionId) return { allow: true }
    return { allow: true }
  }
  if (!incomingSessionId || incomingSessionId !== owner) {
    return { allow: false, reason: 'SESSION_CONFLICT' }
  }
  return { allow: true }
}

/** 启动恢复时只加载本会话与遗留（无 sessionId）草稿，忽略其他窗口的草稿。 */
export const filterDraftsForSession = <T extends StoredDraft>(
  all: Record<string, T>,
  sessionId: string,
): Record<string, T> => {
  const out: Record<string, T> = {}
  for (const [id, draft] of Object.entries(all)) {
    if (!draft || typeof draft.content !== 'string') continue
    const owner = draft.draftSessionId
    if (!owner || owner === sessionId) out[id] = draft
  }
  return out
}

export const normalizeStoredDraft = (value: unknown): StoredDraft | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.content !== 'string' || typeof record.savedAt !== 'number') return null
  const draft: StoredDraft = {
    content: record.content,
    savedAt: record.savedAt,
  }
  if (typeof record.baselineSha256 === 'string' && /^[a-f0-9]{64}$/.test(record.baselineSha256)) {
    draft.baselineSha256 = record.baselineSha256
  }
  if (typeof record.draftSessionId === 'string' && record.draftSessionId.length > 0) {
    draft.draftSessionId = record.draftSessionId
  }
  return draft
}
