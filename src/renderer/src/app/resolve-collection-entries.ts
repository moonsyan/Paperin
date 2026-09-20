import type { WorkspaceIndex } from '../../../shared/workspace-index'
import { getCollectionIndexBlockReason, type PublishScope } from '../lib/export-bundle'
import {
  extractCollectionOrder,
  extractCollectionTitle,
  type CollectionEntry,
} from '../lib/document-collection'
import { toEditorImages } from '../lib/image-path'
import { sameFilePath } from './document-session/filePath'

export interface OpenDocumentContent {
  path: string
  content: string
}

export interface ResolveCollectionEntriesOptions {
  workspaceIndex: WorkspaceIndex | null
  activePath: string
  readDocument: (path: string) => Promise<{ ok: boolean; data?: { content?: string } }>
  /** 已打开标签的实时正文。有匹配时不再读磁盘，避免集合导出丢掉未保存修改。 */
  openContents?: readonly OpenDocumentContent[]
}

/**
 * 按发布范围（标签/当前目录）从工作区索引中筛选文档并读取内容，
 * 返回排序后的集合条目。纯异步数据逻辑，不依赖 React。
 */
export async function resolveCollectionEntries(
  scope: Exclude<PublishScope, { kind: 'document' }>,
  { workspaceIndex, activePath, readDocument, openContents }: ResolveCollectionEntriesOptions,
): Promise<CollectionEntry[]> {
  const blockReason = getCollectionIndexBlockReason(workspaceIndex)
  if (blockReason) throw new Error(blockReason)
  const index = workspaceIndex!
  const lastSep = Math.max(activePath.lastIndexOf('/'), activePath.lastIndexOf('\\'))
  const activeDir = lastSep > 0 ? activePath.slice(0, lastSep) : ''
  const selected = Object.values(index.documents).filter((doc) => {
    if (scope.kind === 'tag') return doc.tags.some((t) => t.toLowerCase() === scope.tag.toLowerCase())
    const docSep = Math.max(doc.path.lastIndexOf('/'), doc.path.lastIndexOf('\\'))
    return (docSep > 0 ? doc.path.slice(0, docSep) : '') === activeDir
  })
  if (selected.length === 0) return []
  if (selected.length > 200) throw new Error(`集合范围包含 ${selected.length} 篇文档（上限 200），请缩小范围`)
  const entries: CollectionEntry[] = []
  for (const doc of selected) {
    const live = openContents?.find((item) => sameFilePath(item.path, doc.path))
    const content = live
      ? live.content
      : await readDocument(doc.path).then((res) => (
        res.ok && typeof res.data?.content === 'string' ? res.data.content : null
      ))
    if (content == null) throw new Error(`无法读取文档：${doc.path}`)
    const imgSep = Math.max(doc.path.lastIndexOf('/'), doc.path.lastIndexOf('\\'))
    entries.push({
      path: doc.path,
      title: extractCollectionTitle(content, doc.name.replace(/\.md$/i, '')),
      order: extractCollectionOrder(content),
      content: toEditorImages(content, imgSep > 0 ? doc.path.slice(0, imgSep) : undefined),
    })
  }
  return entries
}
