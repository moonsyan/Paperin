/**
 * 文档会话纯状态：以 `Record<id, DocumentRecord>` 为唯一存储的不可变迁移。
 *
 * useDocumentSession（Task 7）迁移时将以此为准收敛打开/关闭/切换、内容
 * 同步与保存落账；此层不持有 ProseMirror 状态，也不做任何 IO。
 */

import type { DocumentRecord } from './document-record'
import { markDocumentSaved, migrateDocumentPath, updateDocumentContent } from './document-record'

export interface DocumentSessionState {
  documents: Record<string, DocumentRecord>
  activeFileId: string | null
}

export const emptyDocumentSessionState = (): DocumentSessionState => ({
  documents: {},
  activeFileId: null,
})

/** 打开文档：新记录入字典并激活；已存在的记录只激活，不覆盖会话编辑状态 */
export const openDocumentInSession = (
  state: DocumentSessionState,
  record: DocumentRecord,
): DocumentSessionState => {
  const existing = state.documents[record.id]
  return {
    documents: existing ? state.documents : { ...state.documents, [record.id]: record },
    activeFileId: record.id,
  }
}

/** 编辑内容同步到指定文档；文档不存在时返回原状态 */
export const updateDocumentContentInSession = (
  state: DocumentSessionState,
  id: string,
  content: string,
): DocumentSessionState => {
  const record = state.documents[id]
  if (!record) return state
  return {
    ...state,
    documents: { ...state.documents, [id]: updateDocumentContent(record, content) },
  }
}

/** 保存落账：以磁盘事实更新基线并清除 dirty；文档不存在时返回原状态 */
export const markDocumentSavedInSession = (
  state: DocumentSessionState,
  id: string,
  content: string,
  modifiedTime: number,
): DocumentSessionState => {
  const record = state.documents[id]
  if (!record) return state
  return {
    ...state,
    documents: { ...state.documents, [id]: markDocumentSaved(record, content, modifiedTime) },
  }
}

/** 重命名/移动后的路径迁移：只改目标文档 path/name，id 与激活关系不变 */
export const migrateDocumentPathInSession = (
  state: DocumentSessionState,
  id: string,
  path: string,
  name: string,
): DocumentSessionState => {
  const record = state.documents[id]
  if (!record) return state
  return {
    ...state,
    documents: { ...state.documents, [id]: migrateDocumentPath(record, path, name) },
  }
}

/** 关闭文档：从字典移除；关闭活动文档时按打开顺序优先回退右侧相邻标签 */
export const closeDocumentInSession = (
  state: DocumentSessionState,
  id: string,
): DocumentSessionState => {
  if (!state.documents[id]) return state
  const order = Object.keys(state.documents)
  const documents = { ...state.documents }
  delete documents[id]

  let activeFileId = state.activeFileId
  if (activeFileId === id) {
    const index = order.indexOf(id)
    // 右侧相邻优先，其次左侧相邻，最后清空
    const fallback =
      index < order.length - 1 ? order[index + 1] : index > 0 ? order[index - 1] : null
    activeFileId = fallback !== undefined && fallback !== id ? fallback : null
  }

  return { documents, activeFileId }
}
