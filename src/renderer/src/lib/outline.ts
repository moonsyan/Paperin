export interface OutlineNode {
  idx: number
  level: number
  text: string
  children: OutlineNode[]
}

/** 扁平标题记录；行号均为物理行号（1 起，包含 Frontmatter 行） */
export interface OutlineHeading {
  level: number
  text: string
  /** 标题所在行：ATX 为标记行，setext 为下划线行 */
  line: number
  /** 标题文本所在行：ATX 与 line 相同；setext 为上方的段落行 */
  textLine: number
}

export interface OutlineBlockLine {
  text: string
  /** 该行处于 frontmatter / 围栏块内（含开闭行），正文口径应跳过 */
  block: 'frontmatter' | 'fence' | null
}

// L9：围栏行可带 0-3 空格缩进（CommonMark）且可嵌在块引用内（> ```）
const FENCE_LINE_RE = /^[ ]{0,3}(?:>\s*)*(`{3,}|~{3,})(.*)$/
const FRONTMATTER_DELIMITER_RE = /^---\s*$/
const SETEXT_UNDERLINE_RE = /^[ ]{0,3}(?:>\s*)*(=+|-+)\s*$/
const ATX_HEADING_RE = /^[ ]{0,3}(?:>\s*)*(#{1,4})\s+(.+)$/
const BLOCKQUOTE_PREFIX_RE = /^[ ]{0,3}(?:>\s*)*/

/**
 * 逐行块级状态扫描：给出每行是否处于 frontmatter / 围栏块内。
 * 开栏状态遵循 CommonMark 规则——关栏行必须与开栏同记号（` 或 ~）、
 * 长度不小于开栏、且无信息串；4 反引号栏内的 ``` 内容行不是关栏。
 * 大纲标题检测与章节统计共用同一状态机，保证"哪些行是正文"只有一种口径。
 */
export const scanOutlineBlocks = (content: string): OutlineBlockLine[] => {
  const lines = content.split('\n')
  const result: OutlineBlockLine[] = []
  let fence: { marker: string; length: number } | null = null
  let inFrontmatter = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 文档首行 `---` 开启 YAML frontmatter：其中 "title: xxx" 等键值会被
    // 标题正则误判为 H2，先把整块跳过去
    if (i === 0 && FRONTMATTER_DELIMITER_RE.test(line)) {
      inFrontmatter = true
      result.push({ text: line, block: 'frontmatter' })
      continue
    }
    if (inFrontmatter) {
      if (FRONTMATTER_DELIMITER_RE.test(line)) inFrontmatter = false
      result.push({ text: line, block: 'frontmatter' })
      continue
    }
    const fenceLine = FENCE_LINE_RE.exec(line)
    if (fenceLine) {
      const marker = fenceLine[1][0]
      const length = fenceLine[1].length
      const info = fenceLine[2].trim()
      if (!fence) {
        fence = { marker, length }
      } else if (marker === fence.marker && length >= fence.length && info === '') {
        fence = null
      }
      result.push({ text: line, block: 'fence' })
      continue
    }
    result.push({ text: line, block: fence ? 'fence' : null })
  }
  return result
}

/**
 * 从块级扫描结果中提取扁平标题序列（h1-h4）。
 * - 引用块内标题（`> # x`）计入——渲染层生成真实 h1，大纲与 DOM 都收录；
 * - 列表项内标题（`- # foo`、`1. ## bar`）不计入——CommonMark 渲染层
 *   生成真实 h1/h2，但 Markdown 行级扫描不收录；纳入会导致状态栏/大纲
 *   高亮索引与大纲点击定位（DOM 已同步跳过 li）不一致。
 */
export const parseOutlineHeadingsFromBlocks = (
  blockLines: OutlineBlockLine[],
): OutlineHeading[] => {
  const headings: OutlineHeading[] = []
  // 上一行是否为正文段落（setext 下划线必须紧跟段落才有意义）
  let prevWasParagraph = false
  for (let i = 0; i < blockLines.length; i++) {
    const info = blockLines[i]
    const line = info.text
    const physicalLine = i + 1
    if (info.block) {
      // 围栏/frontmatter 行不是段落：处理后必须清掉段落状态，否则围栏关闭
      // 行后的 `===` 会误用围栏前的段落状态被当成 setext 下划线
      prevWasParagraph = false
      continue
    }
    // setext 下划线：`=` 恒为 setext h1；`-` 任意数量（CommonMark：跟在段落
    // 后的 `---` 是 h2 下划线，不是主题分隔线——只有前面没有段落的 `---`
    // 才是分隔线）。此前只认 1-2 个 `-`，`前文\n---` 被漏判，Milkdown 渲染
    // 层却生成真实 h2 DOM，outline 索引与 DOM 标题索引错位，点击大纲会
    // 滚动/高亮到错误的标题
    const setextMatch = SETEXT_UNDERLINE_RE.exec(line)
    if (prevWasParagraph && setextMatch) {
      const isH1 = setextMatch[1].includes('=')
      // 缩进/引用前缀剥掉后取上一行正文作为标题文本
      const text = blockLines[i - 1].text.replace(BLOCKQUOTE_PREFIX_RE, '').trim()
      headings.push({ level: isH1 ? 1 : 2, text, line: physicalLine, textLine: physicalLine - 1 })
      prevWasParagraph = false
      continue
    }
    // L9：标题前最多允许 3 个空格缩进——4 空格缩进的代码块里的
    // `    # 伪标题` 是缩进代码不是标题；只用空格计数，tab 在 CommonMark
    // 中等于 4 空格（缩进代码块），`\t# x` 不是标题（原实现 `\s{0,3}`
    // 会匹配 tab 造成误判进大纲）
    const match = ATX_HEADING_RE.exec(line)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2],
        line: physicalLine,
        textLine: physicalLine,
      })
      prevWasParagraph = false
      continue
    }
    // 行尾更新段落状态：空行/标题行/分隔线/列表项不算段落
    prevWasParagraph =
      line.trim() !== '' &&
      !/^[ ]{0,3}(?:>\s*)*(#{1,4})\s+/.test(line) &&
      !SETEXT_UNDERLINE_RE.test(line) &&
      !/^[ ]{0,3}(?:>\s*)*[-*+]\s+/.test(line)
  }
  return headings
}

/** 提取正文与引用块中的 h1-h4 扁平序列，忽略代码围栏内的伪标题与 YAML frontmatter。 */
export const parseOutlineHeadings = (content: string): OutlineHeading[] =>
  parseOutlineHeadingsFromBlocks(scanOutlineBlocks(content))

const buildOutlineTree = (headings: { level: number; text: string }[]): OutlineNode[] => {
  const root: OutlineNode[] = []
  const stack: OutlineNode[] = []
  headings.forEach((heading, idx) => {
    const node: OutlineNode = {
      idx,
      level: heading.level,
      text: heading.text,
      children: [],
    }
    while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop()
    if (stack.length) stack[stack.length - 1].children.push(node)
    else root.push(node)
    stack.push(node)
  })
  return root
}

/** 提取正文与引用块中的 h1-h4 大纲树，忽略代码围栏内的伪标题与 YAML frontmatter。 */
export const parseOutline = (content: string): OutlineNode[] =>
  buildOutlineTree(parseOutlineHeadings(content))
