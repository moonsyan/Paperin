import { scanOutlineBlocks } from './outline'

/* ==================== 中文排版检查（只报告可确定性修复） ====================
 *
 * 规则口径：
 * - CJK_LATIN_SPACING：中文字符与英文字母直接相邻时建议插入一个空格（盘古之白）。
 *   数字不参与——"第3章"、"3个"是常见紧排写法，插入空格属于语义改写。
 * - FULLWIDTH_PUNCTUATION：全角标点前的连续空格、以及后随正文内容的空格建议删除；
 *   行尾空格不删（Markdown 硬换行）。
 * - DUPLICATE_SPACE：行内非行首的连续空格建议合并为一个。
 * - HEADING_SPACE：ATX 标题标记（##标题）后缺空格建议插入。
 *
 * Frontmatter、围栏代码（含开闭行）、行内代码、URL 与公式区域整体跳过：
 * 这些区域按占位符掩码处理（等长 \u0000），问题坐标始终映射回原文。
 */

export interface TypographyIssue {
  code: 'CJK_LATIN_SPACING' | 'FULLWIDTH_PUNCTUATION' | 'DUPLICATE_SPACE' | 'HEADING_SPACE'
  start: number
  end: number
  message: string
  replacement?: string
  /** 所在物理行（1 起），供诊断面板定位 */
  line: number
}

const CJK_RE = '[\\u4e00-\\u9fff\\u3400-\\u4dbf]'
/** 全角标点集合（用于空格清理；不含会被 Markdown 语义影响的结构符号） */
const FULLWIDTH_PUNCT = '，。！？；：、“”‘’《》【】（）…—'
const MASK = '\u0000'

const INLINE_CODE_RE = /`[^`]*`/g
/** 开头 $ 后不紧跟空白、结尾 $ 前非空白，避免货币金额误判 */
const INLINE_MATH_RE = /\$(?!\s)[^$\n]+?(?<!\s)\$/g
const URL_RE = new RegExp(`https?://[^\\s${FULLWIDTH_PUNCT}]+`, 'g')
const FULLWIDTH_BEFORE_RE = new RegExp(` +(?=[${FULLWIDTH_PUNCT}])`, 'g')
const FULLWIDTH_AFTER_RE = new RegExp(`[${FULLWIDTH_PUNCT}] +(?=\\S)`, 'g')
const DUPLICATE_SPACE_RE = /(?<=\S) {2,}(?=\S)/g
const HEADING_SPACE_RE = /^ {0,3}(#{1,6})([^#\s])/
const CJK_BEFORE_LATIN_RE = new RegExp(`(${CJK_RE})([A-Za-z])`, 'g')
const LATIN_BEFORE_CJK_RE = new RegExp(`([A-Za-z])(${CJK_RE})`, 'g')

/** 将正则命中的区间等长替换为占位符，保持偏移量不变 */
const maskRanges = (text: string, re: RegExp): string => {
  let out = text
  for (;;) {
    const match = re.exec(out)
    if (!match) break
    const start = match.index
    const end = start + match[0].length
    out = out.slice(0, start) + MASK.repeat(match[0].length) + out.slice(end)
    re.lastIndex = start + match[0].length
  }
  re.lastIndex = 0
  return out
}

/** exec 循环（ES5 target 下不可迭代 matchAll） */
const forEachMatch = (text: string, re: RegExp, onMatch: (match: RegExpExecArray) => void): void => {
  for (;;) {
    const match = re.exec(text)
    if (!match) break
    onMatch(match)
    re.lastIndex = match.index + Math.max(1, match[0].length)
  }
  re.lastIndex = 0
}

/** 块级公式 $$...$$（可跨行）掩码：落入公式内的字符（含 $$ 定界符）等长置为占位符 */
const maskMathBlockSegments = (line: string, state: { inMath: boolean }): string => {
  let out = ''
  let rest = line
  for (;;) {
    const idx = rest.indexOf('$$')
    if (!state.inMath) {
      if (idx < 0) {
        out += rest
        break
      }
      out += rest.slice(0, idx) + MASK.repeat(2)
      state.inMath = true
      rest = rest.slice(idx + 2)
    } else {
      if (idx < 0) {
        out += MASK.repeat(rest.length)
        break
      }
      out += MASK.repeat(idx + 2)
      state.inMath = false
      rest = rest.slice(idx + 2)
    }
    if (rest.length === 0) break
  }
  return out
}

/** 收集单行问题；lineStart 为该行首字符在全文中的偏移，lineNo 为物理行号 */
const collectLineIssues = (
  rawLine: string,
  lineStart: number,
  lineNo: number,
  mathState: { inMath: boolean },
): TypographyIssue[] => {
  const issues: TypographyIssue[] = []
  const masked = maskRanges(
    maskRanges(maskRanges(rawLine, INLINE_CODE_RE), INLINE_MATH_RE),
    URL_RE,
  )
  const safeLine = maskMathBlockSegments(masked, mathState)

  const heading = HEADING_SPACE_RE.exec(safeLine)
  if (heading) {
    const at = lineStart + heading[1].length
    issues.push({
      code: 'HEADING_SPACE',
      start: at,
      end: at,
      message: '标题标记后缺少空格',
      replacement: ' ',
      line: lineNo,
    })
  }

  forEachMatch(safeLine, FULLWIDTH_BEFORE_RE, (match) => {
    issues.push({
      code: 'FULLWIDTH_PUNCTUATION',
      start: lineStart + match.index,
      end: lineStart + match.index + match[0].length,
      message: '全角标点前不应有空格',
      replacement: '',
      line: lineNo,
    })
  })
  forEachMatch(safeLine, FULLWIDTH_AFTER_RE, (match) => {
    issues.push({
      code: 'FULLWIDTH_PUNCTUATION',
      start: lineStart + match.index + 1,
      end: lineStart + match.index + match[0].length,
      message: '全角标点后不应有空格',
      replacement: '',
      line: lineNo,
    })
  })

  forEachMatch(safeLine, CJK_BEFORE_LATIN_RE, (match) => {
    const at = lineStart + match.index + 1
    issues.push({
      code: 'CJK_LATIN_SPACING',
      start: at,
      end: at,
      message: '中文与英文之间建议插入空格',
      replacement: ' ',
      line: lineNo,
    })
  })
  forEachMatch(safeLine, LATIN_BEFORE_CJK_RE, (match) => {
    const at = lineStart + match.index + 1
    issues.push({
      code: 'CJK_LATIN_SPACING',
      start: at,
      end: at,
      message: '中文与英文之间建议插入空格',
      replacement: ' ',
      line: lineNo,
    })
  })

  forEachMatch(safeLine, DUPLICATE_SPACE_RE, (match) => {
    issues.push({
      code: 'DUPLICATE_SPACE',
      start: lineStart + match.index,
      end: lineStart + match.index + match[0].length,
      message: '连续空格建议保留一个',
      replacement: ' ',
      line: lineNo,
    })
  })

  return issues
}

/** 规则优先级：空格清理 > 中英空隙 > 连续空格合并（重叠时保留高优先级） */
const CODE_PRIORITY: Record<TypographyIssue['code'], number> = {
  FULLWIDTH_PUNCTUATION: 0,
  CJK_LATIN_SPACING: 1,
  HEADING_SPACE: 2,
  DUPLICATE_SPACE: 3,
}

/** 重叠去重：高优先级规则先占位，零宽插入不与区间冲突 */
const dedupeIssues = (issues: TypographyIssue[]): TypographyIssue[] => {
  const sorted = issues
    .slice()
    .sort((a, b) =>
      CODE_PRIORITY[a.code] - CODE_PRIORITY[b.code] ||
      a.start - b.start ||
      a.end - b.end,
    )
  const kept: TypographyIssue[] = []
  for (const issue of sorted) {
    const overlaps = kept.some((existing) =>
      issue.start < existing.end && existing.start < issue.end,
    )
    if (!overlaps) kept.push(issue)
  }
  return kept.sort((a, b) => a.start - b.start || a.end - b.end)
}

/** 检查 Markdown 中的中文排版问题；只输出可确定性修复的建议 */
export const inspectChineseTypography = (markdown: string): TypographyIssue[] => {
  if (typeof markdown !== 'string') return []
  const blockLines = scanOutlineBlocks(markdown)
  const mathState = { inMath: false }
  const issues: TypographyIssue[] = []
  let lineStart = 0
  blockLines.forEach((info, i) => {
    const lineNo = i + 1
    // 围栏/frontmatter 行整体跳过（围栏内的 $ 也不推进公式状态）
    if (!info.block) {
      issues.push(...collectLineIssues(info.text, lineStart, lineNo, mathState))
    }
    lineStart += info.text.length + 1
  })
  return dedupeIssues(issues)
}

/**
 * 将排版修复应用到 Markdown：坐标自后向前应用，范围非法或与已应用区域
 * 重叠的 issue 被忽略；无 replacement 的 issue 仅提示、不改动。
 */
export const applyTypographyFixes = (markdown: string, issues: TypographyIssue[]): string => {
  if (typeof markdown !== 'string') return markdown
  if (!Array.isArray(issues) || issues.length === 0) return markdown
  const sorted = issues
    .slice()
    .sort((a, b) => b.start - a.start || b.end - a.end)
  let boundary = markdown.length
  let out = markdown
  for (const issue of sorted) {
    const { start, end, replacement } = issue
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end > out.length ||
      start > end ||
      end > boundary
    ) {
      continue
    }
    if (replacement === undefined) continue
    out = out.slice(0, start) + replacement + out.slice(end)
    boundary = start
  }
  return out
}
