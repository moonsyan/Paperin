import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * 键盘焦点可见性门禁：扫描样式表，凡是「无条件抹掉默认轮廓」的规则，
 * 都必须在同一文件里配上 `:focus` / `:focus-visible` / `:focus-within` 的可见替代。
 *
 * 为什么需要：`outline: none` 是浏览器里最容易被顺手写下的无障碍缺陷——键盘用户
 * 按 Tab 时焦点落到控件上却看不出落点在哪。这类问题在代码 review 里几乎看不出来
 * （规则本身语法正确、视觉上也「更干净」），但在纯键盘操作下会让界面不可用。
 *
 * 判定口径：
 * - 只检查**基础规则**（选择器里不含 `:hover/:focus/:active`），因为带伪类的规则
 *   本身就是状态样式，不属于「默认轮廓被抹掉」的现场。
 * - 可见替代的判定：该焦点规则声明了非 none 的 `outline`、或 `box-shadow`、
 *   或 `border-color`、或非 none 的 `border`。
 * - 例外必须写进 `EXEMPTIONS` 并给出理由，且例外必须仍然命中（防止清单腐化）。
 */

const STYLES_DIR = new URL('../src/renderer/src/styles/', import.meta.url)

/**
 * 把规则体拆成 `属性 -> 值`（值统一小写）。
 * 用结构解析而不是「值里有没有 none」的正则：`\s*` 允许零宽间隔，
 * 正则在 `outline: none` 的冒号后空匹配，就会把「抹掉轮廓」误判成「有轮廓」。
 */
export const parseDeclarations = (body) => {
  const declarations = new Map()
  for (const chunk of body.split(';')) {
    const index = chunk.indexOf(':')
    if (index < 0) continue
    declarations.set(
      chunk.slice(0, index).trim().toLowerCase(),
      chunk.slice(index + 1).trim().toLowerCase(),
    )
  }
  return declarations
}

/** 值是否真的会被画出来（none / 0 / transparent 都等于没画） */
const isVisibleValue = (value) =>
  value !== undefined && !['none', '0', '0px', 'transparent', 'rgba(0,0,0,0)'].includes(value)

/** 生成完整焦点环所允许的替代声明 */
export const hasVisibleReplacement = (body) => {
  const declarations = parseDeclarations(body)
  return (
    isVisibleValue(declarations.get('outline')) ||
    isVisibleValue(declarations.get('outline-color')) ||
    isVisibleValue(declarations.get('outline-width')) ||
    isVisibleValue(declarations.get('box-shadow')) ||
    isVisibleValue(declarations.get('border-color')) ||
    isVisibleValue(declarations.get('border'))
  )
}

const FOCUS_SELECTOR_RE = /:focus(-visible|-within)?\b/
const OUTLINE_REMOVAL_RE = /(?:^|[;{\s])outline\s*:\s*(?:none|0)\b/
/** 纯状态选择器：它们描述的是元素的某个瞬时状态，不属于「默认轮廓被抹掉」的现场 */
const STATE_ONLY_SELECTOR_RE = /:(hover|active|checked|disabled|target)\b/

/**
 * 有意不显示焦点环的元素：必须逐条给出理由。
 * 判定键为 `文件相对路径::选择器`。
 */
export const EXEMPTIONS = [
  {
    key: 'components/editor.css::.milkdown .editor',
    reason: '正文编辑区是持续聚焦的写作区，焦点由主题色光标（caret-color）体现，绘制轮廓会干扰排版',
  },
]

/** 递归收集样式表文件（相对 styles/ 的路径，统一用 / 分隔） */
export const listStyleFiles = async (dir = STYLES_DIR, prefix = '') => {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...(await listStyleFiles(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`)))
    } else if (entry.name.endsWith('.css')) {
      out.push(`${prefix}${entry.name}`)
    }
  }
  return out.sort()
}

/** 去掉块注释，避免注释里的花括号 / 关键字干扰规则切分 */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** 将 CSS 文本切成 `{ selector, body }` 列表（不处理 @media 嵌套，够用且无歧义） */
export const parseRules = (css) => {
  const rules = []
  for (const match of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selector: match[1].replace(/\s+/g, ' ').trim(), body: match[2] })
  }
  return rules
}

const splitSelectors = (selector) =>
  selector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

/**
 * 检查单个样式表的焦点可见性。
 *
 * @returns {{ file: string, violations: Array<{selector, line}>, hits: string[] }}
 *   `hits` 是所有「抹掉轮廓且有兜底」的选择器（用于校验例外清单未腐化）
 */
export const auditFile = (file, css) => {
  const stripped = stripComments(css)
  const rules = parseRules(css)
  const violations = []
  const hits = []

  for (const rule of rules) {
    if (!OUTLINE_REMOVAL_RE.test(rule.body)) continue

    // 焦点规则自己抹掉轮廓：必须当场给出替代，否则等于把落点提示从键盘用户眼前拿走
    if (FOCUS_SELECTOR_RE.test(rule.selector)) {
      if (!hasVisibleReplacement(rule.body)) {
        violations.push({
          selector: rule.selector,
          line: lineOf(stripped, rule.selector),
          kind: '焦点规则内抹掉轮廓且无可见替代',
        })
      }
      continue
    }

    const bases = splitSelectors(rule.selector).filter((part) => !STATE_ONLY_SELECTOR_RE.test(part))
    if (bases.length === 0) continue
    const covered = rules.some((candidate) => {
      if (!FOCUS_SELECTOR_RE.test(candidate.selector)) return false
      if (!hasVisibleReplacement(candidate.body)) return false
      return splitSelectors(candidate.selector).some((part) =>
        bases.some((base) => part === `${base}:focus` || part.startsWith(`${base}:focus`)),
      )
    })

    // 例外键按第一个选择器记录，与 EXEMPTIONS 的写法保持一致
    const key = `${file}::${bases[0]}`
    if (covered) hits.push(key)
    else violations.push({ selector: rule.selector, line: lineOf(stripped, rule.selector) })
  }

  return { file, violations, hits }
}

/** 粗略定位选择器出现的行号，便于人工跳转 */
const lineOf = (css, selector) => {
  const index = css.indexOf(selector)
  if (index < 0) return 0
  return css.slice(0, index).split('\n').length
}

/** 扫描全部样式表 */
export const auditStyles = async () => {
  const files = await listStyleFiles()
  const files_ = []
  const violations = []
  const hits = new Set()

  for (const file of files) {
    const css = await readFile(new URL(file, STYLES_DIR), 'utf8')
    const result = auditFile(file, css)
    files_.push(file)
    for (const hit of result.hits) hits.add(hit)
    for (const violation of result.violations) violations.push({ file, ...violation })
  }

  const exemptKeys = new Set(EXEMPTIONS.map((item) => item.key))
  // 例外项同样计入命中集合，用于判定例外清单是否腐化
  for (const item of violations) hits.add(`${item.file}::${item.selector}`)
  const unexempted = violations.filter((item) => !exemptKeys.has(`${item.file}::${item.selector}`))
  const staleExemptions = EXEMPTIONS.filter((item) => !hits.has(item.key))

  return {
    files: files_,
    hits: [...hits].sort(),
    violations: unexempted,
    appliedExemptions: violations.filter((item) =>
      exemptKeys.has(`${item.file}::${item.selector}`),
    ),
    staleExemptions,
  }
}

export const formatReport = (result) => {
  const lines = []
  lines.push(`扫描样式表 ${result.files.length} 个`)
  lines.push(`抹掉轮廓且已有焦点兜底 ${result.hits.length} 处，豁免 ${result.appliedExemptions.length} 处，违规 ${result.violations.length} 处`)
  for (const item of result.violations) {
    lines.push(`  FAIL ${item.file}:${item.line}  ${item.selector}`)
  }
  for (const item of result.appliedExemptions) {
    lines.push(`  exempt ${item.file}:${item.line}  ${item.selector}`)
  }
  for (const item of result.staleExemptions) {
    lines.push(`  stale  ${item.key}（已不再命中，请从 EXEMPTIONS 移除）`)
  }
  return lines.join('\n')
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirectRun) {
  const result = await auditStyles()
  process.stdout.write(`${formatReport(result)}\n`)
  const failed = result.violations.length > 0 || result.staleExemptions.length > 0
  process.stdout.write(failed ? '\n焦点可见性门禁：失败\n' : '\n焦点可见性门禁：通过\n')
  process.exitCode = failed ? 1 : 0
}
