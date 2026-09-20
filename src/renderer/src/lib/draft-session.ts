import type { SessionData } from '../hooks/useDocumentSessionPersistence'

export const createDraftSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 从已持久化会话读取窗口草稿会话 id；缺失时生成新 id（由调用方写回 session）。 */
export const resolveDraftSessionId = (session: SessionData | null | undefined): string => {
  const existing = session?.draftSessionId
  if (typeof existing === 'string' && existing.length > 0 && existing.length <= 128) {
    return existing
  }
  return createDraftSessionId()
}
