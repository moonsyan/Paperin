import type { MutableRefObject } from 'react'
import { isDocumentDirty } from '../../lib/document-tabs'

/** 保存冲突检测用的磁盘 mtime；只读 ref，避免 useCallback 闭包里的 fileMtime state 过期。 */
export function mtimeOfFile(
  fileId: string,
  fileMtimeRef: MutableRefObject<Record<string, number>>,
): number | undefined {
  return fileMtimeRef.current[fileId]
}

export function needsDocumentSave(
  fileId: string,
  liveContentOf: (fileId: string) => string,
  initialOrSavedRef: MutableRefObject<Record<string, string>>,
): boolean {
  return isDocumentDirty(liveContentOf(fileId), initialOrSavedRef.current[fileId] ?? '')
}

/** 结构变更前：活动文档先落账 listener 快照与防抖输入。 */
export async function flushActiveDocumentIf(
  fileId: string,
  activeFileIdRef: MutableRefObject<string>,
  leaveCurrentDocument: () => Promise<boolean>,
  flushEditorContent: () => void,
): Promise<boolean> {
  if (activeFileIdRef.current !== fileId) return true
  if (!(await leaveCurrentDocument())) return false
  flushEditorContent()
  return true
}
