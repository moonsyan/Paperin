import type {
  DiagnosticRecord,
  IndexedDocument,
  WorkspaceIndex,
} from '../../../shared/workspace-index'

export interface StructuredQuery {
  tags?: string[]
  path?: string
  link?: string
  isOrphan?: boolean
  hasImage?: boolean
  error?: string
}

export interface StructuredSearchMatch {
  path: string
  line: number
  preview: string
  generation: number
}

const EXTERNAL_TARGET_RE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

const diagnostic = (
  code: DiagnosticRecord['code'],
  severity: DiagnosticRecord['severity'],
  path: string,
  message: string,
  line?: number,
  target?: string,
): DiagnosticRecord => ({
  id: `${code}:${path}:${line ?? 0}:${target ?? ''}`,
  code,
  severity,
  path,
  ...(line === undefined ? {} : { line }),
  message,
  ...(target === undefined ? {} : { target }),
})

const isResolvedDocument = (target: string, document: IndexedDocument, documents: Record<string, IndexedDocument>): boolean => {
  if (document.outgoingLinks.some((link) => link.target === target && link.resolvedPath)) return true
  const normalized = target.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.md$/i, '')
  return Object.values(documents).some((item) => item.relativePath.replace(/\\/g, '/').replace(/\.md$/i, '') === normalized)
}

export const collectDiagnostics = (index: WorkspaceIndex): DiagnosticRecord[] => {
  const records: DiagnosticRecord[] = []
  const incoming = new Set<string>()
  for (const document of Object.values(index.documents)) {
    for (const link of document.outgoingLinks) {
      if (link.resolvedPath) incoming.add(link.resolvedPath)
    }
  }

  for (const document of Object.values(index.documents)) {
    const headings = new Map<string, number>()
    for (const heading of document.headings) {
      const text = heading.text.trim()
      if (!text) {
        records.push(diagnostic('EMPTY_HEADING', 'warning', document.path, '标题为空', heading.line))
        continue
      }
      const key = text.toLocaleLowerCase()
      if (headings.has(key)) {
        records.push(diagnostic('DUPLICATE_HEADING', 'warning', document.path, `标题重复：${text}`, heading.line, text))
      } else {
        headings.set(key, heading.line)
      }
    }
    for (const link of document.outgoingLinks) {
      if (link.kind === 'wiki') {
        if (!link.resolvedPath) {
          records.push(diagnostic('UNRESOLVED_WIKI', 'warning', document.path, `Wiki 链接未解析：${link.target}`, link.line, link.target))
        } else {
          incoming.add(link.resolvedPath)
        }
        continue
      }
      if (!link.resolvedPath && !EXTERNAL_TARGET_RE.test(link.target) && !isResolvedDocument(link.target, document, index.documents)) {
        records.push(diagnostic('BROKEN_LINK', 'warning', document.path, `链接目标不存在：${link.target}`, link.line, link.target))
      }
      if (link.resolvedPath) incoming.add(link.resolvedPath)
    }
    for (const image of document.imageRefs) {
      if (!image.resolvedPath && !EXTERNAL_TARGET_RE.test(image.target)) {
        records.push(diagnostic('MISSING_ASSET', 'error', document.path, `图片资源不存在：${image.target}`, image.line, image.target))
      }
    }
    const definitions = new Set(document.footnoteDefinitions ?? [])
    for (const reference of document.footnoteRefs ?? []) {
      if (!definitions.has(reference.label)) records.push(diagnostic('FOOTNOTE_ERROR', 'warning', document.path, `脚注未定义：${reference.label}`, reference.line, reference.label))
    }
    if (document.outgoingLinks.length === 0 && !incoming.has(document.path)) {
      records.push(diagnostic('ORPHAN_DOCUMENT', 'info', document.path, '文档没有出链且没有入链'))
    }
  }
  return [...index.diagnostics, ...records]
}

const TOKEN_RE = /(tag|path|link|is|has):(?:"([^"]*)"|(\S+))/g

export const parseStructuredQuery = (query: string): StructuredQuery => {
  const result: StructuredQuery = {}
  const input = query.trim()
  if (!input) return result
  // 模块级 /g 正则的 lastIndex 会跨调用残留：上一次查询抛错中断循环后，
  // 不复位会让本次 exec 从残留位置开始，前导 token 被静默吞掉
  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(input))) {
    const key = match[1]
    const value = match[2] ?? match[3] ?? ''
    if (key === 'tag') (result.tags ??= []).push(value)
    else if (key === 'path') result.path = value
    else if (key === 'link') result.link = value
    else if (key === 'is') {
      if (value !== '孤立' && value !== 'orphan') throw new Error(`不支持的查询值：is:${value}`)
      result.isOrphan = true
    } else if (key === 'has') {
      if (value !== 'image') throw new Error(`不支持的查询值：has:${value}`)
      result.hasImage = true
    }
  }
  const remainder = input.replace(TOKEN_RE, '').trim()
  if (remainder) throw new Error(`不支持的查询语法：${remainder}`)
  return result
}

export const searchStructuredIndex = (index: WorkspaceIndex, query: string): StructuredSearchMatch[] => {
  const parsed = parseStructuredQuery(query)
  const diagnostics = collectDiagnostics(index)
  const orphanPaths = new Set(diagnostics.filter((d) => d.code === 'ORPHAN_DOCUMENT').map((d) => d.path))
  return Object.values(index.documents)
    .filter((document) => {
      if (parsed.tags?.length && !parsed.tags.every((tag) => document.tags.some((item) => item.toLowerCase() === tag.toLowerCase()))) return false
      if (parsed.path && !document.relativePath.toLowerCase().includes(parsed.path.toLowerCase())) return false
      if (parsed.link && !document.outgoingLinks.some((link) => link.target.toLowerCase().includes(parsed.link!.toLowerCase()))) return false
      if (parsed.isOrphan && !orphanPaths.has(document.path)) return false
      if (parsed.hasImage && document.imageRefs.length === 0) return false
      return true
    })
    .map((document) => ({ path: document.path, line: document.headings[0]?.line ?? 1, preview: document.name, generation: index.generation }))
}
