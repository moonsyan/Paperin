import type { DocumentFileVersion } from '../../shared/document-version'
import { isValidContentHash } from '../../shared/document-version'

export interface DocumentVersionConflictInput {
  current: { mtimeMs: number; size: number }
  expectedMtime: number | null
  /** 请求自身读取/确认过的内容哈希；禁止用进程全局 known 代替 */
  expectedContentHash?: string | null
  currentSha256?: string
  /**
   * 进程级缓存仅作可选提示，不得作为请求基线。
   * 有 expectedContentHash 时完全忽略 known 的 hash。
   */
  known?: { mtimeMs: number; size: number; contentSha256?: string }
}

/**
 * 保存冲突只绑定请求携带的版本事实，不用 500ms mtime 容差放行旧基线，
 * 也不用另一窗口更新过的进程全局 hash 冒充本编辑器读过的版本。
 */
export const inspectDocumentVersionConflict = (
  input: DocumentVersionConflictInput,
): { conflict: boolean; needsContentHash: boolean } => {
  const requestHash =
    typeof input.expectedContentHash === 'string' && isValidContentHash(input.expectedContentHash)
      ? input.expectedContentHash
      : null

  if (requestHash) {
    if (!input.currentSha256) {
      return { conflict: false, needsContentHash: true }
    }
    if (input.currentSha256 !== requestHash) {
      return { conflict: true, needsContentHash: false }
    }
    return { conflict: false, needsContentHash: false }
  }

  // 旧会话无 hash：必须重新读取核对，不能用全局 known.hash 代替请求基线。
  // current / expectedMtime 仍由调用方传入以便演进；无 hash 时一律 CONFLICT。
  return { conflict: true, needsContentHash: false }
}

export const toDocumentFileVersion = (input: {
  modifiedTime: number
  size: number
  contentSha256: string
}): DocumentFileVersion => ({
  modifiedTime: input.modifiedTime,
  size: input.size,
  contentSha256: input.contentSha256,
})
