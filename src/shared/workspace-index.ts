/**
 * 统一工作区索引模型（Track C）。
 *
 * 磁盘事实层仍是 Markdown 正文与附件；本索引是可删除、可重建的运行
 * 索引层，标签、链接、图谱、资源与诊断统一从这里消费。
 * `generation` 用于异步竞态防护：generation 变化后旧结果必须丢弃；
 * `complete/truncated` 明确表达覆盖范围，禁止把截断索引当完整结果展示。
 */

import type { WorkspaceLinkKind, WorkspaceLinkRef } from './link-index'
import type { WorkspaceTagIndexEntry } from './tag-index'
import { createInitialWorkspaceCoverage, type WorkspaceCoverage } from './workspace-coverage'

export interface HeadingRecord {
  level: number
  text: string
  /** 1 起的行号；空标题（EMPTY_HEADING 诊断）也收录 */
  line: number
}

export interface LinkRecord {
  sourcePath: string
  target: string
  line: number
  /** 服务层解析后的工作区内目标路径（解析失败时缺省） */
  resolvedPath?: string
  kind: WorkspaceLinkKind
}

export interface TagRecord {
  name: string
  paths: string[]
}

export interface AssetReference {
  sourcePath: string
  target: string
  line: number
  /** 服务层解析后的资源绝对路径（解析失败时缺省） */
  resolvedPath?: string
}

export interface AssetRecord {
  /** 解析后的资源路径；未解析成功时为原始 target */
  path: string
  relativePath: string
  size: number
  referencedBy: string[]
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export type DiagnosticCode =
  | 'BROKEN_LINK'
  | 'MISSING_ASSET'
  | 'EMPTY_HEADING'
  | 'DUPLICATE_HEADING'
  | 'FOOTNOTE_ERROR'
  | 'UNRESOLVED_WIKI'
  | 'ORPHAN_DOCUMENT'

export interface DiagnosticRecord {
  id: string
  code: DiagnosticCode
  severity: DiagnosticSeverity
  path: string
  line?: number
  message: string
  /** 诊断指向的目标（链接目标/资源路径/重复标题文本等） */
  target?: string
}

/** 解析器输入：路径事实 + 正文快照；解析器不读磁盘、不导入 Electron */
export interface DocumentIndexInput {
  path: string
  relativePath: string
  name: string
  size: number
  modifiedTime: number
  content: string
}

export interface IndexedDocument {
  path: string
  relativePath: string
  name: string
  size: number
  modifiedTime: number
  headings: HeadingRecord[]
  /** frontmatter tags（去重、去引号、去前导 #），口径同标签面板 */
  tags: string[]
  /** frontmatter 顶层标量/列表键（简化解析，复杂 YAML 原样跳过） */
  frontmatter: Record<string, string | string[]>
  outgoingLinks: LinkRecord[]
  imageRefs: AssetReference[]
  footnoteRefs?: Array<{ label: string; line: number }>
  footnoteDefinitions?: string[]
}

export interface WorkspaceIndex {
  workspacePath: string
  /** ISO 时间戳：最近一次重建/更新时刻 */
  generatedAt: string
  generation: number
  /** 本 generation 是否覆盖全部文件（扫描完成且未截断） */
  complete: boolean
  /** 是否因预算限制只覆盖部分文件 */
  truncated: boolean
  /** 与 complete/truncated 同步的覆盖明细；跳过原因仅本地诊断，不进遥测 */
  coverage: WorkspaceCoverage
  /** 绝对路径 → 索引文档 */
  documents: Record<string, IndexedDocument>
  links: LinkRecord[]
  tags: TagRecord[]
  assets: AssetRecord[]
  diagnostics: DiagnosticRecord[]
}

export type WorkspaceIndexEvent =
  | { type: 'progress'; generation: number; scanned: number; total: number }
  | { type: 'updated'; index: WorkspaceIndex }
  | { type: 'failed'; generation: number; code: string; message?: string }

/** 空索引骨架：generation=0，complete=false（未扫描前禁止按完整索引进行动作） */
export const createEmptyWorkspaceIndex = (workspacePath: string): WorkspaceIndex => ({
  workspacePath,
  generatedAt: new Date().toISOString(),
  generation: 0,
  complete: false,
  truncated: false,
  coverage: { ...createInitialWorkspaceCoverage(), complete: false },
  documents: {},
  links: [],
  tags: [],
  assets: [],
  diagnostics: [],
})

/** 从文档集合派生标签视图：名称去重（大小写不敏感）后按 paths 聚合 */
export const collectTagRecords = (documents: Record<string, IndexedDocument>): TagRecord[] => {
  const byName = new Map<string, TagRecord>()
  for (const document of Object.values(documents)) {
    for (const tag of document.tags) {
      const key = tag.toLowerCase()
      const record = byName.get(key)
      if (record) {
        if (!record.paths.includes(document.path)) record.paths.push(document.path)
      } else {
        byName.set(key, { name: tag, paths: [document.path] })
      }
    }
  }
  return Array.from(byName.values())
}

/** 从文档集合派生资源引用：按 target 聚合引用方（sourcePath 去重保序） */
export const collectAssetReferences = (
  documents: Record<string, IndexedDocument>,
): AssetRecord[] => {
  const byTarget = new Map<string, AssetRecord>()
  for (const document of Object.values(documents)) {
    for (const ref of document.imageRefs) {
      const existing = byTarget.get(ref.target)
      if (existing) {
        if (!existing.referencedBy.includes(document.path)) {
          existing.referencedBy.push(document.path)
        }
      } else {
        byTarget.set(ref.target, {
          path: ref.target,
          relativePath: ref.target,
          size: 0,
          referencedBy: [document.path],
        })
      }
    }
  }
  return Array.from(byTarget.values())
}

const toLinkRecords = (document: IndexedDocument): LinkRecord[] =>
  document.outgoingLinks.map((link) => ({
    sourcePath: document.path,
    target: link.target,
    line: link.line,
    kind: link.kind,
  }))

/** 增量写入单个文档：documents/links/tags/assets 同步重建，generation 交给服务层推进 */
export const upsertDocumentIntoIndex = (
  index: WorkspaceIndex,
  document: IndexedDocument,
): WorkspaceIndex => {
  const documents = { ...index.documents, [document.path]: document }
  return {
    ...index,
    documents,
    links: Object.values(documents).flatMap(toLinkRecords),
    tags: collectTagRecords(documents),
    assets: collectAssetReferences(documents),
  }
}

/** 移除文档及其 links/tags/assets 贡献；文档不存在时返回原引用 */
export const removeDocumentFromIndex = (
  index: WorkspaceIndex,
  path: string,
): WorkspaceIndex => {
  if (!index.documents[path]) return index
  const documents = { ...index.documents }
  delete documents[path]
  return {
    ...index,
    documents,
    links: Object.values(documents).flatMap(toLinkRecords),
    tags: collectTagRecords(documents),
    assets: collectAssetReferences(documents),
  }
}

/** 供服务层从旧 DTO 迁移/兼容的入口（后续任务接线） */
export type { WorkspaceLinkRef, WorkspaceTagIndexEntry }
