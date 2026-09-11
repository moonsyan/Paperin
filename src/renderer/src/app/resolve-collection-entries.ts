import type { WorkspaceIndex } from '../../../shared/workspace-index'
import type { PublishScope } from '../lib/export-bundle'
import {
  extractCollectionOrder,
  extractCollectionTitle,
  type CollectionEntry,
} from '../lib/document-collection'
import { toEditorImages } from '../lib/image-path'

export interface ResolveCollectionEntriesOptions {
  workspaceIndex: WorkspaceIndex | null
  activePath: string
  readDocument: (path: string) => Promise<{ ok: boolean; data?: { content?: string } }>
}

/**
 * 按发布范围（标签/当前目录）从工作区索引中筛选文档并读取内容，
 * 返回排序后的集合条目。纯异步数据逻辑，不依赖 React。
 */
export async function resolveCollectionEntries(
  scope: Exclude<PublishScope, { kind: 'document' }>,
  { workspaceIndex, activePath, readDocument }: ResolveCollectionEntriesOptions,
): Promise<CollectionEntry[]> {
  if (!workspaceIndex) throw new Error('请先打开工作区后再使用集合导出')
  const lastSep = Math.max(activePath.lastIndexOf('/'), activePath.lastIndexOf('\\'))
  const activeDir = lastSep > 0 ? activePath.slice(0, lastSep) : ''
  const selected = Object.values(workspaceIndex.documents).filter((doc) => {
    if (scope.kind === 'tag') return doc.tags.some((t) => t.toLowerCase() === scope.tag.toLowerCase())
    const docSep = Math.max(doc.path.lastIndexOf('/'), doc.path.lastIndexOf('\\'))
    return (docSep > 0 ? doc.path.slice(0, docSep) : '') === activeDir
  })
  if (selected.length === 0) return []
  if (selected.length > 200) throw new Error(`集合范围包含 ${selected.length} 篇文档（上限 200），请缩小范围`)
  const entries: CollectionEntry[] = []
  for (const doc of selected) {
    const res = await readDocument(doc.path)
    const content = res.ok && typeof res.data?.content === 'string' ? res.data.content : null
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
