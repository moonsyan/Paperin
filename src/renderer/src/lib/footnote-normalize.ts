/**
 * 脚注占位定义补全（Typora 风格）
 *
 * gfm 的 remarkFootnote 规则：仅当文档中存在 `[^label]: 定义` 时，
 * 行内的 `[^label]` 才会被解析为可点击的上标节点；孤立引用（无定义）
 * 会保持字面文本 `[^label]`。这与本编辑器"Typora 风格"的定位不符——
 * 用户输入 `[^aaa]` 期望立即成为上标脚注。
 *
 * 这里在加载文档时对 markdown 做一次纯字符串变换：为所有没有对应定义的
 * 行内引用补一个空占位定义 `[^label]:`，保证 gfm 解析出上标。
 * 变换幂等：已存在定义的标签不再追加；仅追加文本，不改动原有内容顺序。
 *
 * 注意：此函数只处理「加载期/字符串层」的孤立引用。编辑器内实时键入的
 * 孤立引用由 `plugins/footnote.ts` 的输入规则在事务层补节点（见该文件）。
 */

/** 行内引用 `[^label]`：非 `!` 前缀（图片替代文本）、非 `\` 转义、后不接 `:`（那是定义） */
const FOOTNOTE_REF = /(^|[^\\!])\[\^([^\]\s]+)\](?!:)/g
/** 定义 `[^label]:` */
const FOOTNOTE_DEF = /\[\^([^\]\s]+)\]:/g

/**
 * 掩掉不参与脚注语法的区域（字符长度不变，仅替换为空格）：
 * 围栏代码块、frontmatter 头部、行内代码、空行后的缩进代码块。
 * 这些区域里的 `[^x]` / `[^x]:` 是字面文本——参与计数会漏补真实定义
 * 或向用户文件追加从未编写的占位定义并落盘。
 */
const maskFencedBlocks = (markdown: string): string => {
  const lines = markdown.split('\n')
  let fence: string | null = null
  let inFrontmatter = /^ {0,3}---\s*$/.test(lines[0] ?? '')
  let inIndentedCode = false
  let prevBlank = true
  return lines
    .map((line, index) => {
      // frontmatter 整段掩掉（index 0 的 --- 是起始分隔符本身）
      if (inFrontmatter) {
        if (index > 0 && /^ {0,3}---\s*$/.test(line)) inFrontmatter = false
        return ' '.repeat(line.length)
      }
      const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line)
      if (fence) {
        // 结束围栏：同字符且长度不小于开始围栏
        if (fenceMatch && line.trim().startsWith(fence)) fence = null
        return ' '.repeat(line.length)
      }
      if (fenceMatch) {
        fence = fenceMatch[1]![0]!.repeat(fenceMatch[1]!.length)
        return ' '.repeat(line.length)
      }
      // 行内代码段（记号写作 `[^1]`）不算引用或定义
      const maskedInline = line.replace(/`[^`]*`/g, (segment) => ' '.repeat(segment.length))
      // 缩进代码块：仅当紧跟空行后（CommonMark 规则；列表续行不误伤）
      if (inIndentedCode) {
        if (maskedInline.trim() === '' || /^ {4,}/.test(maskedInline) || /^\t/.test(maskedInline)) {
          return ' '.repeat(line.length)
        }
        inIndentedCode = false
      } else if (prevBlank && (/^ {4,}\S/.test(maskedInline) || /^\t\S/.test(maskedInline))) {
        inIndentedCode = true
        return ' '.repeat(line.length)
      }
      prevBlank = maskedInline.trim() === ''
      return maskedInline
    })
    .join('\n')
}

export const ensureFootnoteDefinitions = (markdown: string): string => {
  if (!markdown) return markdown

  const scoped = maskFencedBlocks(markdown)
  const defLabels = new Set<string>()
  let match: RegExpExecArray | null
  FOOTNOTE_DEF.lastIndex = 0
  while ((match = FOOTNOTE_DEF.exec(scoped)) !== null) {
    if (match[1]) defLabels.add(match[1])
  }

  const refLabels: string[] = []
  FOOTNOTE_REF.lastIndex = 0
  while ((match = FOOTNOTE_REF.exec(scoped)) !== null) {
    if (match[2]) refLabels.push(match[2])
  }

  const missing = refLabels.filter((label) => !defLabels.has(label))
  if (missing.length === 0) return markdown

  const appended = missing.map((label) => `[^${label}]:`).join('\n')
  const trimmed = markdown.replace(/\s+$/, '')
  // 文末追加占位定义；空定义仍被 remarkFootnote 视为有效定义，引用即渲染为上标
  return `${trimmed}\n\n${appended}\n`
}
