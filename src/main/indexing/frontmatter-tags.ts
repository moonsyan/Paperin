/* frontmatter tags 提取（从 workspace-tag-index.ts 抽出的纯函数，无 Electron 依赖）。
 * 统一索引解析器（document-index-parser）与标签面板扫描共用此实现，
 * 不允许出现第二套口径。 */

const FRONTMATTER_OPEN_RE = /^ {0,3}---\s*$/
// 仅识别顶层 tags / tag 键（YAML 键名大小写敏感，Obsidian 惯用小写）
const TAGS_KEY_RE = /^(tags|tag):\s*(.*)$/
const LIST_ITEM_RE = /^ {1,}-\s*(.*)$/

export const MAX_TAGS_PER_FILE = 50

/** 归一化单个标签：去包裹引号、去前导 #、去空白；空值返回 null */
const normalizeTag = (raw: string): string | null => {
  let tag = raw.trim()
  // 去一层包裹引号（YAML 标量常见写法）
  if (tag.length >= 2 && ((tag[0] === '"' && tag.endsWith('"')) || (tag[0] === "'" && tag.endsWith("'")))) {
    tag = tag.slice(1, -1).trim()
  }
  // Obsidian 正文风格 #前缀 不入库；纯 # 无效
  tag = tag.replace(/^#+/, '').trim()
  return tag ? tag : null
}

/**
 * 从 Markdown 全文提取 frontmatter 的 tags/tag 键值。
 * 支持三种写法：
 *   tags: [a, b]        行内数组（单行）
 *   tags: a, b          逗号分隔标量
 *   tags:               块级列表（后续 `- x` 行，缩进须大于键行）
 * frontmatter 未闭合/首行非 --- 时视为无 frontmatter；单文件最多 MAX_TAGS_PER_FILE 个。
 */
export function extractTagsFromFrontmatter(content: string): string[] {
  const lines = content.split(/\r?\n/)
  if (!FRONTMATTER_OPEN_RE.test(lines[0] ?? '')) return []
  const tags: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | undefined): void => {
    if (tags.length >= MAX_TAGS_PER_FILE) return
    const tag = normalizeTag(raw ?? '')
    if (!tag || seen.has(tag.toLowerCase())) return
    seen.add(tag.toLowerCase())
    tags.push(tag)
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    // --- 闭合：未找到 tags 键即结束
    if (FRONTMATTER_OPEN_RE.test(line)) return tags
    const keyMatch = line.match(TAGS_KEY_RE)
    if (!keyMatch) continue
    const inline = keyMatch[2].trim()
    if (inline.startsWith('[')) {
      // 行内数组：取到闭合 ] 为止（跨行数组只解析首行内的部分）
      const inner = inline.slice(1, inline.includes(']') ? inline.indexOf(']') : undefined)
      for (const item of inner.split(',')) push(item)
      return tags
    }
    if (inline) {
      // 逗号分隔标量（单个值天然兼容）
      for (const item of inline.split(',')) push(item)
      return tags
    }
    // 块级列表：读取后续缩进行，直到闭合 --- 或非列表行
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]
      if (FRONTMATTER_OPEN_RE.test(next)) return tags
      const item = next.match(LIST_ITEM_RE)
      if (!item) break
      push(item[1])
    }
    return tags
  }
  return tags
}

/** frontmatter 顶层键值简化解析：标量（去引号）或行内数组/块列表 → string[]。
 *  复杂 YAML（嵌套、多行字符串、注释语义）不解析、原样跳过——索引层
 *  只服务筛选展示，不承担 YAML 序列化职责。未闭合 frontmatter 返回空。 */
export function extractFrontmatterFields(
  content: string,
): Record<string, string | string[]> {
  const lines = content.split(/\r?\n/)
  if (!FRONTMATTER_OPEN_RE.test(lines[0] ?? '')) return {}
  const fields: Record<string, string | string[]> = {}
  let closed = false

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (FRONTMATTER_OPEN_RE.test(line)) {
      closed = true
      break
    }
    const keyMatch = line.match(/^([\w-]+):\s*(.*)$/)
    if (!keyMatch) continue
    const key = keyMatch[1]
    // tags/tag 键由 extractTagsFromFrontmatter 单独收录，不重复进入通用字段
    if (key === 'tags' || key === 'tag') continue
    const inline = keyMatch[2].trim()
    if (inline.startsWith('[')) {
      if (inline.includes(']')) {
        const inner = inline.slice(1, inline.indexOf(']'))
        fields[key] = inner
          .split(',')
          .map((item) => item.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)
      } else {
        // 行内数组未闭合：跨行列表不解析，忽略该键
        fields[key] = inline
      }
      continue
    }
    if (inline) {
      fields[key] = inline.replace(/^["']|["']$/g, '')
      continue
    }
    // 块级列表
    const items: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]
      if (FRONTMATTER_OPEN_RE.test(next)) break
      const item = next.match(LIST_ITEM_RE)
      if (!item) break
      const value = item[1].trim().replace(/^["']|["']$/g, '')
      if (value) items.push(value)
      i = j
    }
    if (items.length > 0) fields[key] = items
  }

  void closed
  return fields
}
