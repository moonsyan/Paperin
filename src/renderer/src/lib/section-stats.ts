import { estimateReadMinutes } from './stats'
import { parseOutlineHeadingsFromBlocks, scanOutlineBlocks } from './outline'

export interface SectionStat {
  level: number
  text: string
  startLine: number
  words: number
  readingMinutes: number
}

export interface SectionStatsResult {
  totalWords: number
  sections: SectionStat[] // 无标题文档返回单个全文节
}

/**
 * 章节字数与全文口径：剥离 Markdown 标记后按非空白字符计数（中文按字、
 * 英文按字母，与状态栏"字"一致），章节额外跳过 Frontmatter、围栏代码、
 * 行内代码和公式——这些内容不进入章节阅读节奏。
 */
const countWords = (text: string): number => text.replace(/\s/g, '').length

/** 剩余文本是否含至少一个字母/数字/CJK 字符；用于跳过分隔线、表格分隔行等纯符号行。
 * 字符区段覆盖 ASCII、拉丁扩展、希腊/西里尔、假名、谚文与 CJK 统一表意文字；
 * 不用 \p{L} 的 u 标志——tsconfig.web 未显式设置 target，ES5 下该标志不可用。 */
const HAS_WORD_CHAR_RE =
  /[0-9A-Za-z\u00c0-\u024f\u0370-\u1fff\u2c00-\u2fdf\u3040-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/

/** 行内公式：开头 $ 后不能紧跟空白、结尾 $ 前不能是空白——"花费 $5 和 $6" 不被误判 */
const INLINE_MATH_RE = /\$(?!\s)[^$\n]+?(?<!\s)\$/g
const INLINE_CODE_RE = /`[^`]*`/g

/** 剥离块级公式 $$...$$（可跨行），返回该行计入正文的部分 */
const stripMathBlocks = (line: string, state: { inMath: boolean }): string => {
  let out = ''
  let rest = line
  for (;;) {
    const idx = rest.indexOf('$$')
    if (!state.inMath) {
      if (idx < 0) {
        out += rest
        break
      }
      out += rest.slice(0, idx)
      state.inMath = true
      rest = rest.slice(idx + 2)
    } else {
      if (idx < 0) break
      state.inMath = false
      rest = rest.slice(idx + 2)
    }
  }
  return out
}

/** 按既有状态栏口径逐行剥离 Markdown 标记、保留可读文字 */
const stripMarkdownMarks = (line: string): string =>
  line
    // 先剥引用前缀，blockquote 内标题（> # x）的标记才能剥掉
    .replace(/^[ ]{0,3}>\s?/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+\[[ xX]\]\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~|]/g, '')

/** 计算单行计入正文的部分；返回空串表示该行无正文字数 */
const countableLineText = (rawLine: string, mathState: { inMath: boolean }): string => {
  // 行内代码最先剥离：代码里的 $$/$ 不能触发公式状态或被当作公式
  const noCode = rawLine.replace(INLINE_CODE_RE, '')
  const noMathBlock = stripMathBlocks(noCode, mathState)
  const text = stripMarkdownMarks(noMathBlock.replace(INLINE_MATH_RE, ''))
  return HAS_WORD_CHAR_RE.test(text) ? text : ''
}

/**
 * 计算章节统计：每个标题一节，字数与阅读时长累计包含其嵌套子标题；
 * 无标题文档返回单个全文节。startLine 以 Frontmatter 之后为基准（1 起）。
 * 字数口径复用状态栏的"非空白字符"定义，阅读时长复用 lib/stats 的混合估算。
 */
export const computeSectionStats = (markdown: string): SectionStatsResult => {
  const content = markdown ?? ''
  const blockLines = scanOutlineBlocks(content)
  const headings = parseOutlineHeadingsFromBlocks(blockLines)

  // Frontmatter 行数：正文行号 = 物理行号 - frontmatterLines
  let frontmatterLines = 0
  while (
    frontmatterLines < blockLines.length &&
    blockLines[frontmatterLines].block === 'frontmatter'
  ) {
    frontmatterLines++
  }

  // 正文行号 → 扁平标题序号（setext 标题从其文本行开始归属）
  const headingStartAtBodyLine = new Map<number, number>()
  headings.forEach((heading, idx) => {
    headingStartAtBodyLine.set(heading.textLine - frontmatterLines, idx)
  })

  const ownTexts: string[][] = headings.map(() => [])
  const preambleText: string[] = []
  const mathState = { inMath: false }
  let current = -1

  blockLines.forEach((info, i) => {
    if (info.block) return
    const bodyLine = i + 1 - frontmatterLines
    const headingIdx = headingStartAtBodyLine.get(bodyLine)
    if (headingIdx !== undefined) current = headingIdx
    const countable = countableLineText(info.text, mathState)
    if (!countable) return
    const bucket = current < 0 ? preambleText : ownTexts[current]
    bucket.push(countable)
  })

  if (headings.length === 0) {
    const text = preambleText.join('\n')
    const words = countWords(text)
    return {
      totalWords: words,
      sections: [
        { level: 0, text: '', startLine: 1, words, readingMinutes: estimateReadMinutes(text) },
      ],
    }
  }

  const ownWords = ownTexts.map((lines) => countWords(lines.join('\n')))
  // 父节累计：子标题在扁平序列中必然晚于父标题，倒序累加即可
  const parentOf = new Array<number>(headings.length).fill(-1)
  const stack: number[] = []
  headings.forEach((heading, idx) => {
    while (stack.length && headings[stack[stack.length - 1]].level >= heading.level) stack.pop()
    parentOf[idx] = stack.length ? stack[stack.length - 1] : -1
    stack.push(idx)
  })
  const words = ownWords.slice()
  const texts = ownTexts.map((lines) => lines.join('\n'))
  for (let idx = headings.length - 1; idx >= 0; idx--) {
    const parent = parentOf[idx]
    if (parent < 0) continue
    words[parent] += words[idx]
    texts[parent] = texts[parent] ? `${texts[parent]}\n${texts[idx]}` : texts[idx]
  }

  const totalWords =
    countWords(preambleText.join('\n')) + ownWords.reduce((sum, n) => sum + n, 0)

  const sections: SectionStat[] = headings.map((heading, idx) => ({
    level: heading.level,
    text: heading.text,
    startLine: heading.textLine - frontmatterLines,
    words: words[idx],
    readingMinutes: estimateReadMinutes(texts[idx]),
  }))
  return { totalWords, sections }
}

/** 目标为 null 时返回 null；否则返回封顶 100 的百分比 */
export const goalProgress = (words: number, targetWords: number | null): number | null => {
  if (targetWords == null || targetWords <= 0) return null
  return Math.max(0, Math.min(100, Math.round((words / targetWords) * 100)))
}
