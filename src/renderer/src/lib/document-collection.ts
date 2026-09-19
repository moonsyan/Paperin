import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { mathFromMarkdown } from 'mdast-util-math'
import { gfm } from 'micromark-extension-gfm'
import { math } from 'micromark-extension-math'
import { extractFrontmatterRaw, parseFrontmatterYaml } from './frontmatter-parser'
import { isWritingTemplate, renderWritingTemplate } from './writing-templates'
import type { WritingTemplateId } from './writing-templates'

/* ==================== 文档集合发布与开发者文档模板 ====================
 *
 * 集合发布：把"当前目录/按标签"的多篇 Markdown 按约定顺序合并为单个
 * HTML 文档（每篇一个锚点小节 + 集合目录），复用发布模板与资源包管线。
 * 顺序约定：Frontmatter `order` 升序（同序号保持输入顺序稳定）；
 * 缺 order 的文档排在最后并按路径排序。
 *
 * 渲染：基于 mdast（CommonMark + GFM）的树遍历，正文文本一律转义，
 * 不输出任何来源侧原始 HTML（安全导出）。公式以 TeX 源码文本形式呈现
 * （集合导出不内嵌 KaTeX 字体），复杂排版建议逐篇使用当前文档导出。
 */

export type DocumentTemplate = 'readme' | 'api' | 'design' | 'changelog' | WritingTemplateId

export interface CollectionEntry {
  path: string
  title: string
  order: number
  content: string
}

/** Frontmatter order：缺失/非法返回 Infinity（排在最后） */
export const extractCollectionOrder = (markdown: string): number => {
  if (typeof markdown !== 'string') return Number.POSITIVE_INFINITY
  const frontmatter = extractFrontmatterRaw(markdown)
  if (!frontmatter) return Number.POSITIVE_INFINITY
  const props = parseFrontmatterYaml(frontmatter.text)
  const raw = props.order
  const value = typeof raw === 'string' ? Number(raw.trim()) : Number.NaN
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY
  return value
}

/** 集合标题：Frontmatter title → 首个标题（含 h2+）→ 回退名 */
export const extractCollectionTitle = (markdown: string, fallback: string): string => {
  if (typeof markdown !== 'string') return fallback
  const frontmatter = extractFrontmatterRaw(markdown)
  if (frontmatter) {
    const props = parseFrontmatterYaml(frontmatter.text)
    const title = typeof props.title === 'string' ? props.title.trim() : ''
    if (title) return title
  }
  const headingRe = /^ {0,3}#{1,6}\s+(.+?)\s*$/gm
  const match = headingRe.exec(markdown)
  return match?.[1]?.trim() || fallback
}

/** 集合排序：order 升序（稳定）；缺 order 殿后并按路径排序 */
export const orderCollection = (entries: CollectionEntry[]): CollectionEntry[] => {
  const indexed = entries.map((entry, index) => ({ entry, index }))
  indexed.sort((a, b) => {
    const aInf = !Number.isFinite(a.entry.order)
    const bInf = !Number.isFinite(b.entry.order)
    if (aInf && bInf) {
      return a.entry.path.localeCompare(b.entry.path) || a.index - b.index
    }
    if (aInf) return 1
    if (bInf) return -1
    if (a.entry.order !== b.entry.order) return a.entry.order - b.entry.order
    return a.index - b.index
  })
  return indexed.map((item) => item.entry)
}

/* ---------- mdast → HTML（转义文本，不透传来源 HTML） ---------- */

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
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** URL 属性安全化：仅允许 http(s)、mdimg、协议相对与相对路径/锚点；
 *  其余协议（javascript:/data:/vbscript: 等）降级为 #。
 *  协议必须显式判定——javascript: 同样以字母开头，不能用
 *  "字母开头即相对路径"放行；判定前去除控制字符，浏览器会忽略
 *  scheme 内的制表/换行（jAvASc\nript: 仍按 javascript 执行） */
const safeUrl = (url: string): string => {
  const trimmed = url.trim()
  if (!trimmed) return '#'
  const compact = Array.from(trimmed, (ch) => (ch.charCodeAt(0) <= 0x20 ? '' : ch)).join('')
  if (/^(https?:|mdimg:)/i.test(compact) || compact.startsWith('//')) return trimmed
  if (compact.startsWith('#')) return trimmed
  // 无协议前缀才视为相对路径
  if (/^[^:]*:/.test(compact)) return '#'
  return trimmed
}

/** 行内节点渲染 */
const renderInlineChildren = (nodes: MdastNode[]): string =>
  nodes.map(renderNode).join('')

const renderNode = (node: MdastNode): string => {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value ?? '')
    case 'emphasis':
      return `<em>${renderInlineChildren(node.children ?? [])}</em>`
    case 'strong':
      return `<strong>${renderInlineChildren(node.children ?? [])}</strong>`
    case 'delete':
      return `<del>${renderInlineChildren(node.children ?? [])}</del>`
    case 'inlineCode':
      return `<code>${escapeHtml(node.value ?? '')}</code>`
    case 'inlineMath':
      return `<span class="math-inline">${escapeHtml(node.value ?? '')}</span>`
    case 'break':
      return '<br>\n'
    case 'link':
      return `<a href="${escapeHtml(safeUrl(node.url ?? ''))}"${node.title ? ` title="${escapeHtml(node.title)}"` : ''}>${renderInlineChildren(node.children ?? [])}</a>`
    case 'image':
      return `<img src="${escapeHtml(safeUrl(node.url ?? ''))}" alt="${escapeHtml(node.alt ?? '')}">`
    case 'linkReference':
    case 'imageReference':
      // 引用定义未被解析时退化为文本内容
      return renderInlineChildren(node.children ?? [])
    case 'footnoteReference': {
      const label = escapeHtml(node.value ?? '')
      return `<sup data-type="footnote_reference">[${label}]</sup>`
    }
    case 'html':
      // 来源侧 HTML 一律转义为文本（安全导出，不透传脚本/事件属性）
      return escapeHtml(node.value ?? '')
    default:
      return node.children ? renderInlineChildren(node.children) : escapeHtml(node.value ?? '')
  }
}

const renderList = (node: MdastNode): string => {
  const tag = node.ordered ? 'ol' : 'ul'
  const startAttr = node.ordered && node.start != null && node.start !== 1 ? ` start="${node.start}"` : ''
  const items = (node.children ?? [])
    .map((item) => {
      const children = item.children ?? []
      const checked = item.checked
      if (checked === true || checked === false) {
        const box = `<input type="checkbox" disabled${checked ? ' checked' : ''}> `
        const body = children.map(renderNode).join('')
        return `<li class="task-item">${box}${body}</li>`
      }
      const body = children.map(renderNode).join('')
      return `<li>${body}</li>`
    })
    .join('')
  return `<${tag}${startAttr}>${items}</${tag}>`
}

const renderTable = (node: MdastNode): string => {
  const rows = node.children ?? []
  if (rows.length === 0) return ''
  const renderRow = (row: MdastNode, tag: 'th' | 'td'): string => {
    const cells = (row.children ?? []).map((cell, i) => {
      const align = node.align?.[i]
      const style = align ? ` style="text-align:${align}"` : ''
      return `<${tag}${style}>${renderInlineChildren(cell.children ?? [])}</${tag}>`
    })
    return `<tr>${cells.join('')}</tr>`
  }
  const [head, ...body] = rows
  const headHtml = head ? `<thead>${renderRow(head, 'th')}</thead>` : ''
  const bodyHtml = body.length > 0 ? `<tbody>${body.map((row) => renderRow(row, 'td')).join('')}</tbody>` : ''
  return `<table>${headHtml}${bodyHtml}</table>`
}

/** 块级节点渲染 */
const renderBlock = (node: MdastNode): string => {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, node.depth ?? 1))
      return `<h${level}>${renderInlineChildren(node.children ?? [])}</h${level}>`
    }
    case 'paragraph':
      return `<p>${renderInlineChildren(node.children ?? [])}</p>`
    case 'code':
      return `<pre><code${node.lang ? ` class="language-${escapeHtml(node.lang)}"` : ''}>${escapeHtml(node.value ?? '')}</code></pre>`
    case 'math':
      return `<pre class="math-block">${escapeHtml(node.value ?? '')}</pre>`
    case 'blockquote':
      return `<blockquote>${(node.children ?? []).map(renderBlock).join('')}</blockquote>`
    case 'list':
      return renderList(node)
    case 'table':
      return renderTable(node)
    case 'thematicBreak':
      return '<hr>'
    case 'footnoteDefinition': {
      const label = escapeHtml(node.value ?? '')
      return `<dl data-type="footnote_definition"><dt>[^${label}]</dt><dd>${(node.children ?? []).map(renderBlock).join('')}</dd></dl>`
    }
    case 'yaml':
    case 'toml':
      return ''
    default:
      return node.children ? (node.children.map(renderBlock).join('')) : ''
  }
}

/** Markdown → HTML（CommonMark + GFM；来源 HTML 转义，公式保留 TeX 文本） */
export const renderMarkdownToHtml = (markdown: string): string => {
  if (typeof markdown !== 'string' || !markdown.trim()) return ''
  const tree = fromMarkdown(markdown, {
    extensions: [gfm(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
  })
  return tree.children.map((node) => renderBlock(node as MdastNode)).join('\n')
}

/** 集合 HTML：每篇一个锚点小节 + 集合目录（样式复用导出模板的 .doc-toc） */
export const buildCollectionHtml = (entries: CollectionEntry[]): string => {
  const sections = entries.map((entry, index) => {
    const safeTitle = escapeHtml(entry.title)
    const firstHeading = /^<h1>([\s\S]*?)<\/h1>/.exec(entry.content)
    // 正文已自带 H1 且与标题一致时不重复渲染
    const titleHtml =
      firstHeading && firstHeading[1] === safeTitle ? '' : `<h1 class="collection-doc-title">${safeTitle}</h1>`
    return `<section class="collection-doc" id="doc-${index}">${titleHtml}${entry.content}</section>`
  })
  const tocItems = entries
    .map((entry, index) => `<li><a href="#doc-${index}">${escapeHtml(entry.title)}</a></li>`)
    .join('')
  const toc = entries.length > 1 ? `<nav class="doc-toc"><div class="doc-toc-title">目录</div><ul class="doc-toc-list">${tocItems}</ul></nav>` : ''
  return `${toc}${sections.join('\n')}`
}

/* ---------- 开发者文档模板 ---------- */

const todayText = (): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const TEMPLATE_DEFAULTS: Record<string, string> = {
  name: '未命名项目',
  title: '未命名文档',
  description: '（待补充描述）',
  version: '0.1.0',
  author: '（作者）',
  baseUrl: 'https://api.example.com',
}

const TEMPLATES: Record<Exclude<DocumentTemplate, WritingTemplateId>, (v: Record<string, string>) => string> = {
  readme: (v) => `# ${v.name}

> ${v.description}

## 简介

简要说明这个项目解决什么问题、适合谁使用。

## 安装

\`\`\`bash
npm install ${v.name.toLowerCase().replace(/\s+/g, '-')}
\`\`\`

## 快速上手

\`\`\`ts
import { main } from '${v.name.toLowerCase().replace(/\s+/g, '-')}'

main()
\`\`\`

## 目录结构

\`\`\`
.
├── src/          # 源代码
├── docs/         # 文档
└── README.md
\`\`\`

## 参与贡献

欢迎提交 Issue 与 Pull Request。

## 许可证

MIT © ${v.author}
`,
  api: (v) => `# ${v.title}

## 概述

基础地址：\`${v.baseUrl}\`，所有接口均返回 JSON。

## 认证

请求头携带访问令牌：

\`\`\`http
Authorization: Bearer <token>
\`\`\`

## 接口列表

### 获取资源列表

\`\`\`http
GET ${v.baseUrl}/v1/resources?page=1&size=20
\`\`\`

返回：

\`\`\`json
{
  "items": [{ "id": "1", "name": "资源名称" }],
  "total": 1
}
\`\`\`

## 错误码

| 错误码 | 含义 | 处理建议 |
| --- | --- | --- |
| INVALID_ARGUMENT | 请求参数不合法 | 检查入参 |
| UNAUTHORIZED | 令牌缺失或过期 | 重新获取令牌 |
| TOO_LARGE | 载荷超过上限 | 压缩或分片提交 |
`,
  design: (v) => `# ${v.title}

- 作者：${v.author}
- 日期：${v.date}
- 状态：草案

## 背景与目标

描述本次设计要解决的问题与预期目标。

## 方案

总体思路与关键取舍。

### 数据结构

\`\`\`ts
interface DesignDoc {
  id: string
  title: string
  owner: string
}
\`\`\`

## 边界与风险

列出已知限制、兼容性风险与回退方案。

## 里程碑

- [ ] 方案评审
- [ ] 实现与联调
- [ ]灰度与验收
`,
  changelog: (v) => `# ${v.name} 变更日志

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 约定，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 未发布

### 新增

- 首个可用的项目骨架。

### 变更

- 暂无。

### 修复

- 暂无。
`,
}

/** 开发者文档模板：变量缺失时使用明确默认值，不生成空占位标记 */
export const createDocumentFromTemplate = (
  template: DocumentTemplate,
  variables: Record<string, string> = {},
): string => {
  const resolved: Record<string, string> = { ...TEMPLATE_DEFAULTS, date: todayText() }
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === 'string' && value.trim()) resolved[key] = value.trim()
  }
  if (isWritingTemplate(template)) return renderWritingTemplate(template, resolved)
  const builder = TEMPLATES[template]
  if (!builder) return ''
  return builder(resolved)
}
