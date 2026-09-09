/**
 * DocumentRecord：渲染层统一文档记录。
 *
 * 收敛此前分散在 contents / savedMap / encodingMap / 草稿与标签状态中的
 * 字段，成为会话视图层的单一文档快照：
 * - `content` 是会话快照，不替代 ProseMirror 的真实编辑状态；
 * - `savedContent` 是磁盘事实基线，dirty 由两者比较得出；
 * - `modifiedTime`、`encoding` 只能由文件读写流程更新（markDocumentSaved）；
 * - `preview`、`pinned` 属于标签视图标记，不写入 Markdown 元数据；
 * - 文档 id 与路径解耦：重命名/移动用 migrateDocumentPath 迁移，id 稳定。
 *
 * 所有迁移函数均为纯函数：返回新对象，不修改入参。
 */

export type DocumentEncoding = 'UTF-8' | 'UTF-8-BOM' | 'UTF-16LE' | 'UTF-16BE' | 'GBK'
export type DraftState = 'none' | 'pending' | 'saved' | 'recovered'

export interface CreateDocumentRecordInput {
  id: string
  name: string
  content: string
  path?: string
  modifiedTime?: number
  encoding?: DocumentEncoding
  pinned?: boolean
  preview?: boolean
  draftState?: DraftState
}

export interface DocumentRecord {
  id: string
  path?: string
  name: string
  content: string
  savedContent: string
  modifiedTime?: number
  encoding?: DocumentEncoding
  dirty: boolean
  pinned: boolean
  preview: boolean
  draftState: DraftState
}

export const createDocumentRecord = (input: CreateDocumentRecordInput): DocumentRecord => ({
  id: input.id,
  name: input.name,
  content: input.content,
  savedContent: input.content,
  path: input.path,
  modifiedTime: input.modifiedTime,
  encoding: input.encoding,
  dirty: false,
  pinned: input.pinned === true,
  preview: input.preview === true,
  draftState: input.draftState ?? 'none',
})

/** 编辑内容同步：仅更新会话快照；dirty 以保存基线比较为准 */
export const updateDocumentContent = (record: DocumentRecord, content: string): DocumentRecord => ({
  ...record,
  content,
  dirty: content !== record.savedContent,
})

/** 保存成功回调：以落盘事实更新基线、mtime、编码并清除 dirty */
export const markDocumentSaved = (
  record: DocumentRecord,
  content: string,
  modifiedTime: number,
): DocumentRecord => ({
  ...record,
  content,
  savedContent: content,
  modifiedTime,
  dirty: false,
})

/** 重命名/移动后的路径迁移：只改 path/name，id 与内容、脏状态保持稳定 */
export const migrateDocumentPath = (
  record: DocumentRecord,
  path: string,
  name: string,
): DocumentRecord => ({
  ...record,
  path,
  name,
})
