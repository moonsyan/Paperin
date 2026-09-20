import type { StoredDraft } from '../../../shared/draft-storage'
import { filterDraftsForSession } from '../../../shared/draft-storage'

/** 草稿数据（崩溃/退出后恢复未保存内容）。baselineSha256 是起草时磁盘正文的哈希。 */
export type DraftRecord = StoredDraft
export type DraftMap = Record<string, DraftRecord>

export { filterDraftsForSession }

const BASELINE_SHA256 = /^[a-f0-9]{64}$/

export const isBaselineSha256 = (value: unknown): value is string =>
  typeof value === 'string' && BASELINE_SHA256.test(value)

/** 与主进程内容哈希同一算法，比较的是解码后的正文而不是原始字节。 */
export const sha256Text = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * 有基线哈希时以正文为准：外部工具保留 mtime 改过文件，也不能用旧草稿盖回去。
 * 没有哈希的旧草稿继续只看 mtime。
 */
export const shouldApplyDraftOverDisk = async (input: {
  draftContent: string
  diskContent: string
  baselineSha256?: string
  savedAt?: number
  diskMtime?: number
  readMtime?: number
}): Promise<boolean> => {
  if (input.draftContent === input.diskContent) return false
  if (isBaselineSha256(input.baselineSha256)) {
    return (await sha256Text(input.diskContent)) === input.baselineSha256
  }
  if (
    typeof input.savedAt === 'number'
    && typeof input.diskMtime === 'number'
    && input.diskMtime > input.savedAt
  ) {
    return false
  }
  if (
    typeof input.diskMtime === 'number'
    && typeof input.readMtime === 'number'
    && Math.abs(input.diskMtime - input.readMtime) > 3000
  ) {
    return false
  }
  return true
}

/** 读取全部草稿 */
export async function loadDrafts(): Promise<DraftMap> {
  if (!window.desktopAPI) return {}
  const res = await window.desktopAPI.settings.get('drafts')
  return (res?.ok && res.data ? res.data : {}) as DraftMap
}

/** 原子保存单篇草稿，避免旧的完整草稿副本覆盖其他文档。 */
export async function saveDraft(
  id: string,
  content: string,
  baselineSha256?: string,
  draftSessionId?: string,
): Promise<void> {
  if (!window.desktopAPI) return
  const res = await window.desktopAPI.settings.upsertDraft(
    id,
    content,
    baselineSha256,
    draftSessionId,
  )
  if (!res.ok) throw new Error(res.error?.code ?? 'DRAFT_SAVE_FAILED')
}

/** 原子删除单篇草稿，保留其他标签或窗口的草稿。 */
export async function deleteDraft(id: string, draftSessionId?: string): Promise<void> {
  if (!window.desktopAPI) return
  const res = await window.desktopAPI.settings.deleteDraft(id, draftSessionId)
  if (!res.ok) throw new Error(res.error?.code ?? 'DRAFT_DELETE_FAILED')
}
