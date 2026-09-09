/* Markdown 链接提取（从 workspace-link-index.ts 抽出的纯函数，无 Electron 依赖）。
 * 统一索引解析器（document-index-parser）与反链/图谱扫描共用此实现。 */

import { readdir } from 'fs/promises'
import { join } from 'path'

export const WIKI_LINK_RE = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g
export const MD_LINK_RE = /\[([^\]\n]*)\]\(\s*<?([^)\s<>]+)>?(?:\s+["'(][^)"']*["')])?\s*\)/g
export const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/
export const PREVIEW_MAX_CHARS = 120

/** 媒体/附件扩展：Obsidian 的 ![[xxx.png]] 嵌入不是笔记链接——图片不在
 *  md 树内必然解析失败，进索引只会变成成百上千个无意义的 ghost 节点
 *  淹没图谱（反链面板同理不应把图片嵌入算作引用）。
 *  canvas/excalidraw 同为附件（白板/画板），不算笔记链接 */
export const MEDIA_TARGET_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|tiff?|mp4|webm|mov|avi|mkv|mp3|wav|ogg|flac|m4a|pdf|zip|rar|7z|canvas|excalidraw)$/i

/**
 * 收集工作区内媒体/附件文件的无扩展名基名（小写）：Obsidian 的图片嵌入
 * 常不带扩展名（![[Pasted image 20240101123456]]，实际文件是 .png），
 * 这些目标无法靠扩展名识别，需对照真实附件名排除。
 * 只 readdir 不读文件内容；条目预算外未覆盖的附件退化为扩展名过滤。
 */
export async function collectAttachmentBaseNames(dir: string): Promise<Set<string>> {
  const names = new Set<string>()
  const budget = { entries: 0 }
  const MAX_ENTRIES = 4000
  const MAX_DEPTH = 6
  const walk = async (current: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || budget.entries > MAX_ENTRIES) return
    let entries: import('fs').Dirent[]
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (budget.entries > MAX_ENTRIES) return
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      budget.entries++
      if (entry.isDirectory()) {
        await walk(join(current, entry.name), depth + 1)
        continue
      }
      if (!MEDIA_TARGET_RE.test(entry.name)) continue
      const dot = entry.name.lastIndexOf('.')
      const base = dot > 0 ? entry.name.slice(0, dot) : entry.name
      names.add(base.toLowerCase())
    }
  }
  await walk(dir.replace(/[\\/]+$/, ''), 0)
  return names
}

/**
 * 判断 md 链接目标是否指向工作区内 Markdown 文件：
 * 排除外部协议（http/mailto/mdimg/data）与纯锚点；扩展名口径与树扫描一致
 */
export const isWorkspaceMdLinkTarget = (target: string): boolean => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false
  if (target.startsWith('#')) return false
  return /\.(md|markdown)(#[^#\\/]*)?$/i.test(target)
}

/** 移除行内代码段（反引号包裹），与编辑器 convertWikiText 跳过 code mark 的口径对齐。
 *  反引号数量为奇数（不成对）时，末段按普通文本保留——行内代码需成对，
 *  编辑器同样把不成对的反引号当字面文本，宽一点只会多出编辑器也认的链接 */
export const stripInlineCode = (line: string): string => {
  if (!line.includes('`')) return line
  const parts = line.split('`')
  let out = ''
  // 偶数下标在代码段之外；奇数个反引号时最后一个奇数下标段是普通文本
  for (let i = 0; i < parts.length; i += 2) out += parts[i] ?? ''
  if (parts.length % 2 === 0) out += parts[parts.length - 1] ?? ''
  return out
}

export interface ExtractedLink {
  target: string
  alias?: string
  line: number
  preview: string
  kind: 'wiki' | 'md'
}

/**
 * 从 Markdown 全文提取 wiki 链接与指向 md 文件的相对链接。
 * 逐行扫描：跳过 frontmatter 与围栏代码块；行内代码内的 [[...]] 不算链接
 * （与编辑器加载转换的跳过规则一致，避免反链面板出现编辑器不认的链接）。
 * attachmentBaseNames：工作区附件的无扩展名基名集合，用于排除不带
 * 扩展名的图片/附件嵌入（![[截图 2024]] 实际指向 .png）
 */
export function extractLinksFromMarkdown(
  content: string,
  attachmentBaseNames?: Set<string>,
): ExtractedLink[] {
  const links: ExtractedLink[] = []
  const lines = content.split(/\r?\n/)
  const inFrontmatter = /^\s*---\s*$/.test(lines[0] ?? '')
  let frontmatterClosed = !inFrontmatter
  let fenceChar = ''
  let fenceLength = 0

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (!frontmatterClosed) {
      if (i > 0 && /^\s*---\s*$/.test(raw)) frontmatterClosed = true
      continue
    }
    const fence = raw.match(FENCE_RE)
    if (fenceChar) {
      // 围栏闭合：无 info 的同类标记且长度不小于开栏长度
      if (fence && !fence[2].trim() && fence[1][0] === fenceChar && fence[1].length >= fenceLength) {
        fenceChar = ''
        fenceLength = 0
      }
      continue
    }
    // 开栏允许携带语言 info（```md / ~~~js）
    if (fence) {
      fenceChar = fence[1][0]
      fenceLength = fence[1].length
      continue
    }

    const text = stripInlineCode(raw)
    if (!text.includes('[[') && !text.includes('](')) continue
    const preview = raw.trim().slice(0, PREVIEW_MAX_CHARS)

    WIKI_LINK_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WIKI_LINK_RE.exec(text))) {
      const target = match[1]?.trim() ?? ''
      if (!target) continue
      // 纯锚点引用（[[#标题]]）不指向文件；媒体/附件嵌入（![[x.png]]）
      // 不是笔记链接——两者都不进索引
      if (target.startsWith('#')) continue
      if (MEDIA_TARGET_RE.test(target)) continue
      // 不带扩展名的图片嵌入（![[截图 2024]]）：命中真实附件基名则排除
      if (
        attachmentBaseNames &&
        !target.includes('.') &&
        attachmentBaseNames.has(target.toLowerCase())
      ) {
        continue
      }
      links.push({
        target,
        alias: match[2]?.trim() || undefined,
        line: i + 1,
        preview,
        kind: 'wiki',
      })
    }
    MD_LINK_RE.lastIndex = 0
    while ((match = MD_LINK_RE.exec(text))) {
      const target = match[2]
      if (!target || !isWorkspaceMdLinkTarget(target)) continue
      links.push({
        // 剥掉 #heading 锚点段（与 wiki 解析的锚点剥离口径一致）
        target: target.replace(/#[^#\\/]*$/, ''),
        line: i + 1,
        preview,
        kind: 'md',
      })
    }
  }
  return links
}

export interface ExtractedImageRef {
  target: string
  line: number
}

/**
 * 从 Markdown 全文提取本地图片引用 `![alt](path)`。
 * 与链接提取同一行级规则（frontmatter/围栏/行内代码跳过）；远程协议
 * （http/https/data/mdimg 等）与纯锚点不算本地资源，缺图诊断不涉及。
 */
export function extractImageRefsFromMarkdown(content: string): ExtractedImageRef[] {
  const refs: ExtractedImageRef[] = []
  const IMAGE_RE = /!\[([^\]\n]*)\]\(\s*<?([^)\s<>]+)>?(?:\s+["'(][^)"']*["')])?\s*\)/g
  const lines = content.split(/\r?\n/)
  const inFrontmatter = /^\s*---\s*$/.test(lines[0] ?? '')
  let frontmatterClosed = !inFrontmatter
  let fenceChar = ''
  let fenceLength = 0

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (!frontmatterClosed) {
      if (i > 0 && /^\s*---\s*$/.test(raw)) frontmatterClosed = true
      continue
    }
    const fence = raw.match(FENCE_RE)
    if (fenceChar) {
      if (fence && !fence[2].trim() && fence[1][0] === fenceChar && fence[1].length >= fenceLength) {
        fenceChar = ''
        fenceLength = 0
      }
      continue
    }
    if (fence) {
      fenceChar = fence[1][0]
      fenceLength = fence[1].length
      continue
    }

    const text = stripInlineCode(raw)
    if (!text.includes('](')) continue
    IMAGE_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = IMAGE_RE.exec(text))) {
      const target = match[2]?.trim() ?? ''
      if (!target) continue
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
      if (target.startsWith('#')) continue
      refs.push({ target, line: i + 1 })
    }
  }
  return refs
}
