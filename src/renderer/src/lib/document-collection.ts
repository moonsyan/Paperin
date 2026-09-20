import { extractFrontmatterRaw, parseFrontmatterYaml } from './frontmatter-parser'

export { renderMarkdownToHtml } from './collection-markdown-renderer'
import { isWritingTemplate, renderWritingTemplate } from './writing-templates'
import type { WritingTemplateId } from './writing-templates'

/* ==================== 文档集合发布与开发者文档模板 ====================
 *
 * 集合发布：把"当前目录/按标签"的多篇 Markdown 按约定顺序合并为单个
 * HTML 文档（每篇一个锚点小节 + 集合目录），复用发布模板与资源包管线。
 * 顺序约定：Frontmatter `order` 升序（同序号保持输入顺序稳定）；
 * 缺 order 的文档排在最后并按路径排序。
 *
 * 渲染：见 collection-markdown-renderer（mdast 遍历 + 安全 URL）。
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

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

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
