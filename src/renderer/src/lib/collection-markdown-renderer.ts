import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { mathFromMarkdown } from 'mdast-util-math'
import { gfm } from 'micromark-extension-gfm'
import { math } from 'micromark-extension-math'

import { extractFrontmatterRaw } from './frontmatter-parser'

/**
 * 集合导出专用 Markdown → HTML：CommonMark + GFM + 数学源码。
 * 正文文本转义，不透传来源 HTML；公式/Mermaid 保留源码并标注降级提示。
 */

interface MdastNode {
  type: string
  value?: string
  depth?: number
  lang?: string
  alt?: string
  url?: string
  title?: string | null
  children?: MdastNode[]
  ordered?: boolean
  start?: number | null
  spread?: boolean
  checked?: boolean | null
  align?: Array<'left' | 'right' | 'center' | null> | null
  meta?: string | null
  identifier?: string
  label?: string
  referenceType?: 'full' | 'collapsed' | 'shortcut'
}

interface ReferenceDefinition {
  url: string
  title: string | null | undefined
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** URL 属性安全化：仅允许 http(s)、mdimg、协议相对与相对路径/锚点 */
export const safeExportUrl = (url: string): string => {
  const trimmed = url.trim()
  if (!trimmed) return '#'
  const compact = Array.from(trimmed, (ch) => (ch.charCodeAt(0) <= 0x20 ? '' : ch)).join('')
  if (/^(https?:|mdimg:)/i.test(compact) || compact.startsWith('//')) return trimmed
  if (compact.startsWith('#')) return trimmed
  if (/^[^:]*:/.test(compact)) return '#'
  return trimmed
}

const stripFrontmatterGap = (rest: string): string => {
  let out = rest
  if (out.startsWith('\r\n')) out = out.slice(2)
  else if (out.startsWith('\n')) out = out.slice(1)
  if (out.startsWith('\r\n')) out = out.slice(2)
  else if (out.startsWith('\n')) out = out.slice(1)
  return out
}

const markdownBodyForRender = (markdown: string): string => {
  const frontmatter = extractFrontmatterRaw(markdown)
  if (!frontmatter) return markdown
  return stripFrontmatterGap(markdown.slice(frontmatter.end))
}

const normalizeReferenceId = (id: string): string => id.toLowerCase()

const collectReferenceDefinitions = (nodes: MdastNode[]): Map<string, ReferenceDefinition> => {
  const map = new Map<string, ReferenceDefinition>()
  for (const node of nodes) {
    if (node.type !== 'definition') continue
    const key = normalizeReferenceId(node.identifier ?? node.label ?? '')
    if (!key) continue
    map.set(key, { url: node.url ?? '', title: node.title })
  }
  return map
}

const footnoteAnchorId = (label: string): string =>
  `fn-${encodeURIComponent(label).replace(/%/g, '_')}`

const renderInlineChildren = (nodes: MdastNode[], definitions: Map<string, ReferenceDefinition>): string =>
  nodes.map((node) => renderInline(node, definitions)).join('')

const renderInline = (node: MdastNode, definitions: Map<string, ReferenceDefinition>): string => {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value ?? '')
    case 'emphasis':
      return `<em>${renderInlineChildren(node.children ?? [], definitions)}</em>`
    case 'strong':
      return `<strong>${renderInlineChildren(node.children ?? [], definitions)}</strong>`
    case 'delete':
      return `<del>${renderInlineChildren(node.children ?? [], definitions)}</del>`
    case 'inlineCode':
      return `<code>${escapeHtml(node.value ?? '')}</code>`
    case 'inlineMath':
      return `<span class="math-inline" data-export-degraded="formula">${escapeHtml(node.value ?? '')}</span>`
    case 'break':
      return '<br>\n'
    case 'link':
      return `<a href="${escapeHtml(safeExportUrl(node.url ?? ''))}"${node.title ? ` title="${escapeHtml(node.title)}"` : ''}>${renderInlineChildren(node.children ?? [], definitions)}</a>`
    case 'image':
      return `<img src="${escapeHtml(safeExportUrl(node.url ?? ''))}" alt="${escapeHtml(node.alt ?? '')}">`
    case 'linkReference': {
      const key = normalizeReferenceId(node.identifier ?? node.label ?? '')
      const def = definitions.get(key)
      if (!def) return renderInlineChildren(node.children ?? [], definitions)
      const titleAttr = def.title ? ` title="${escapeHtml(def.title)}"` : ''
      return `<a href="${escapeHtml(safeExportUrl(def.url))}"${titleAttr}>${renderInlineChildren(node.children ?? [], definitions)}</a>`
    }
    case 'imageReference': {
      const key = normalizeReferenceId(node.identifier ?? node.label ?? '')
      const def = definitions.get(key)
      const alt = escapeHtml(node.alt ?? '')
      if (!def) return `<img alt="${alt}" src="#">`
      return `<img src="${escapeHtml(safeExportUrl(def.url))}" alt="${alt}">`
    }
    case 'footnoteReference': {
      const label = node.label ?? node.identifier ?? ''
      const safeLabel = escapeHtml(label)
      const id = footnoteAnchorId(label)
      return `<sup data-type="footnote_reference"><a href="#${escapeHtml(id)}">[${safeLabel}]</a></sup>`
    }
    case 'html':
      return escapeHtml(node.value ?? '')
    default:
      return node.children ? renderInlineChildren(node.children, definitions) : escapeHtml(node.value ?? '')
  }
}

const renderList = (node: MdastNode, definitions: Map<string, ReferenceDefinition>): string => {
  const tag = node.ordered ? 'ol' : 'ul'
  const startAttr = node.ordered && node.start != null && node.start !== 1 ? ` start="${node.start}"` : ''
  const items = (node.children ?? [])
    .map((item) => {
      const children = item.children ?? []
      const checked = item.checked
      const body = children.map((child) => renderBlock(child, definitions)).join('')
      if (checked === true || checked === false) {
        const box = `<input type="checkbox" disabled${checked ? ' checked' : ''}> `
        return `<li class="task-item">${box}${body}</li>`
      }
      return `<li>${body}</li>`
    })
    .join('')
  return `<${tag}${startAttr}>${items}</${tag}>`
}

const renderTable = (node: MdastNode, definitions: Map<string, ReferenceDefinition>): string => {
  const rows = node.children ?? []
  if (rows.length === 0) return ''
  const renderRow = (row: MdastNode, tag: 'th' | 'td'): string => {
    const cells = (row.children ?? []).map((cell, i) => {
      const align = node.align?.[i]
      const style = align ? ` style="text-align:${align}"` : ''
      return `<${tag}${style}>${renderInlineChildren(cell.children ?? [], definitions)}</${tag}>`
    })
    return `<tr>${cells.join('')}</tr>`
  }
  const [head, ...body] = rows
  const headHtml = head ? `<thead>${renderRow(head, 'th')}</thead>` : ''
  const bodyHtml = body.length > 0 ? `<tbody>${body.map((row) => renderRow(row, 'td')).join('')}</tbody>` : ''
  return `<table>${headHtml}${bodyHtml}</table>`
}

const renderBlock = (node: MdastNode, definitions: Map<string, ReferenceDefinition>): string => {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, node.depth ?? 1))
      return `<h${level}>${renderInlineChildren(node.children ?? [], definitions)}</h${level}>`
    }
    case 'paragraph':
      return `<p>${renderInlineChildren(node.children ?? [], definitions)}</p>`
    case 'code': {
      if (node.lang === 'mermaid') {
        return `<pre class="code-block mermaid-degraded" data-export-degraded="mermaid"><code>${escapeHtml(node.value ?? '')}</code></pre>`
      }
      return `<pre><code${node.lang ? ` class="language-${escapeHtml(node.lang)}"` : ''}>${escapeHtml(node.value ?? '')}</code></pre>`
    }
    case 'math':
      return `<pre class="math-block" data-export-degraded="formula">${escapeHtml(node.value ?? '')}</pre>`
    case 'blockquote':
      return `<blockquote>${(node.children ?? []).map((child) => renderBlock(child, definitions)).join('')}</blockquote>`
    case 'list':
      return renderList(node, definitions)
    case 'table':
      return renderTable(node, definitions)
    case 'thematicBreak':
      return '<hr>'
    case 'footnoteDefinition': {
      const label = node.label ?? node.identifier ?? ''
      const safeLabel = escapeHtml(label)
      const id = footnoteAnchorId(label)
      return `<dl id="${escapeHtml(id)}" data-type="footnote_definition"><dt>[^${safeLabel}]</dt><dd>${(node.children ?? []).map((child) => renderBlock(child, definitions)).join('')}</dd></dl>`
    }
    case 'definition':
    case 'yaml':
    case 'toml':
      return ''
    default:
      return node.children ? node.children.map((child) => renderBlock(child, definitions)).join('') : ''
  }
}

/** Markdown → HTML（集合导出；来源 HTML 转义，引用定义与脚注按 GFM 语义解析） */
export const renderMarkdownToHtml = (markdown: string): string => {
  if (typeof markdown !== 'string' || !markdown.trim()) return ''
  const body = markdownBodyForRender(markdown)
  const tree = fromMarkdown(body, {
    extensions: [gfm(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  })
  const nodes = tree.children as MdastNode[]
  const definitions = collectReferenceDefinitions(nodes)
  return nodes
    .filter((node) => node.type !== 'definition')
    .map((node) => renderBlock(node, definitions))
    .join('\n')
}
