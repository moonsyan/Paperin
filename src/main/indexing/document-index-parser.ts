/**
 * 统一索引文档解析器（Track C）：一次解析同时产出标题、标签、frontmatter、
 * 出链与图片引用，供反向链接、图谱、标签、诊断与结构搜索共同消费。
 *
 * 纯函数：不读磁盘、不写状态、不导入 Electron。口径与现有面板一致——
 * - 标题：与大纲面板 parseOutline 相同的行级规则（frontmatter/围栏/引用块/
 *   setext/1-4 级），额外收录空标题供 EMPTY_HEADING 诊断识别；
 * - 标签：复用 extractTagsFromFrontmatter（与标签面板同一实现）；
 * - 链接：复用 extractLinksFromMarkdown（与反链/图谱扫描同一实现）；
 * - 图片：extractImageRefsFromMarkdown（同一行级规则，排除远程协议）。
 */

import type {
  DocumentIndexInput,
  HeadingRecord,
  IndexedDocument,
} from '../../shared/workspace-index'
import { extractTagsFromFrontmatter, extractFrontmatterFields } from './frontmatter-tags'
import {
  extractImageRefsFromMarkdown,
  extractLinksFromMarkdown,
  FENCE_RE,
} from './markdown-links'

/** 超大输入防护：与链接/标签索引的单文件 2MB 上限对齐，超出直接拒解析 */
export const MAX_PARSE_CONTENT_CHARS = 2 * 1024 * 1024

const SETEXT_RE = /^[ ]{0,3}(?:>\s*)*(=+|-+)\s*$/
// 空标题（`#` 单独成行）也收录：大纲面板不展示，但诊断需要识别
const ATX_HEADING_RE = /^[ ]{0,3}(?:>\s*)*(#{1,4})(?:\s+(.*))?\s*$/

/** 提取标题（含行号与空标题），行级规则与 parseOutline 一致 */
export const extractHeadingsWithLines = (content: string): HeadingRecord[] => {
  const headings: HeadingRecord[] = []
  const lines = content.split('\n')
  let fence: { marker: string; length: number } | null = null
  let inFrontmatter = false
  let prevWasParagraph = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === 0 && /^---\s*$/.test(line)) {
      inFrontmatter = true
      prevWasParagraph = false
      continue
    }
    if (inFrontmatter) {
      // 未闭合 frontmatter：整篇按元数据处理，正文标题不进索引
      if (/^---\s*$/.test(line)) {
        inFrontmatter = false
        prevWasParagraph = false
      }
      continue
    }

    const fenceLine = /^[ ]{0,3}(?:>\s*)*(`{3,}|~{3,})(.*)$/.exec(line)
    if (fenceLine) {
      const marker = fenceLine[1][0]
      const length = fenceLine[1].length
      const info = fenceLine[2].trim()
      if (!fence) {
        fence = { marker, length }
      } else if (marker === fence.marker && length >= fence.length && info === '') {
        fence = null
      }
      prevWasParagraph = false
      continue
    }
    if (fence) continue

    const setextMatch = line.match(SETEXT_RE)
    if (prevWasParagraph && setextMatch) {
      const isH1 = setextMatch[1].includes('=')
      const text = (lines[i - 1] ?? '').replace(/^[ ]{0,3}(?:>\s*)*/, '').trim()
      headings.push({ level: isH1 ? 1 : 2, text, line: i })
      prevWasParagraph = false
      continue
    }

    const match = line.match(ATX_HEADING_RE)
    if (match) {
      headings.push({ level: match[1].length, text: (match[2] ?? '').trim(), line: i + 1 })
      prevWasParagraph = false
      continue
    }

    prevWasParagraph =
      line.trim() !== '' &&
      !/^[ ]{0,3}(?:>\s*)*(#{1,4})\s+/.test(line) &&
      !/^[ ]{0,3}(?:>\s*)*(=+|-+)\s*$/.test(line) &&
      !/^[ ]{0,3}(?:>\s*)*[-*+]\s+/.test(line)
  }
  return headings
}

const emptyResult = (
  input: DocumentIndexInput,
): IndexedDocument => ({
  path: input.path,
  relativePath: input.relativePath,
  name: input.name,
  size: input.size,
  modifiedTime: input.modifiedTime,
  headings: [],
  tags: [],
  frontmatter: {},
  outgoingLinks: [],
  imageRefs: [],
})

/** 解析单个文档：输入含路径事实与正文快照；超限输入拒绝解析返回空字段 */
export function parseDocumentIndex(input: DocumentIndexInput): IndexedDocument {
  if (input.content.length > MAX_PARSE_CONTENT_CHARS) return emptyResult(input)

  const headings = extractHeadingsWithLines(input.content)
  const tags = extractTagsFromFrontmatter(input.content)
  const frontmatter = extractFrontmatterFields(input.content)
  const outgoingLinks = extractLinksFromMarkdown(input.content).map((link) => ({
    sourcePath: input.path,
    target: link.target,
    line: link.line,
    kind: link.kind,
  }))
  const imageRefs = extractImageRefsFromMarkdown(input.content).map((ref) => ({
    sourcePath: input.path,
    target: ref.target,
    line: ref.line,
  }))
  const footnoteRefs: Array<{ label: string; line: number }> = []
  const footnoteDefinitions: string[] = []
  let fence = false
  let inFrontmatter = false
  input.content.split('\n').forEach((line, index) => {
    if (index === 0 && /^---\s*$/.test(line)) { inFrontmatter = true; return }
    if (inFrontmatter) { if (/^---\s*$/.test(line)) inFrontmatter = false; return }
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return }
    if (fence) return
    const withoutInlineCode = line.replace(/`[^`]*`/g, '')
    const def = /^\s*\[\^([^\]\s]+)\]:/.exec(withoutInlineCode)
    if (def) footnoteDefinitions.push(def[1])
    const re = /\[\^([^\]\s]+)\](?!:)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(withoutInlineCode))) footnoteRefs.push({ label: match[1], line: index + 1 })
  })

  return {
    path: input.path,
    relativePath: input.relativePath,
    name: input.name,
    size: input.size,
    modifiedTime: input.modifiedTime,
    headings,
    tags,
    frontmatter,
    outgoingLinks,
    imageRefs,
    footnoteRefs,
    footnoteDefinitions,
  }
}

// FENCE_RE 从 markdown-links re-export，保持围栏口径单一来源
export { FENCE_RE }
