import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * 主题可读性门禁：解析 `styles/themes/*.css` 的 token，按 WCAG 2.1 计算对比度。
 *
 * 为什么需要：主题 token 是纯颜色声明，改动时没有任何机械校验能拦住「某个主题的
 * 次级文字变灰到看不清」。把对比度做成测试，就能在改 token 的当下发现问题，
 * 而不必等到人工逐主题冒烟。
 *
 * 两段式门禁（既不放任、也不在重构里强行改版既有主题）：
 *
 * 1. **硬门禁** —— 比值不低于该检查项声明的 WCAG 下限即通过。
 * 2. **棘轮（ratchet）** —— 低于下限的组合必须登记在
 *    `docs/development/theme-contrast-baseline.json` 的 `accepted` 里，并不得比
 *    登记值更差（允许 `margin` 内的浮点抖动）。新出现的低对比组合会直接失败，
 *    已登记的存量债务则只是「不让它变坏」。
 *
 * 之所以不把七套既有主题一次性拉到 4.5:1：`--border-m` 在全部九套主题里都只有
 * 1.16–1.55:1（它承担的是弱分割线角色），强行补对比度等于在重构提交里改掉全部
 * 主题的视觉密度。真正的修法是一次性重定 `--border-m`/输入框描边的语义，属于
 * 独立任务，已记入 docs/ACCESSIBILITY-SMOKE.md 的跟进项。
 *
 * 分级约定：
 * - `text` 门禁 4.5:1 —— 正文级文字（text-1 / text-2 / accent / danger / success）。
 * - `ui`   门禁 3:1   —— 非文字与图形界面元素（边框、强调色块边界、激活标记线）。
 * - `report` 无门禁    —— text-3 / text-4 等弱化提示色，测量值只作为人工冒烟的
 *   输入记录（它们本就承担「低对比但不干扰」的视觉角色，强行拉到 4.5:1 会破坏
 *   现有主题的视觉分层，因此不改 token、只记录）。
 */

const THEMES_DIR = new URL('../src/renderer/src/styles/themes/', import.meta.url)

/**
 * 系统标题栏配色表（Electron `titleBarOverlay`）：不落在主题 CSS 里，
 * 而是 Renderer 侧的一张 TS 映射表，必须单独解析后一起门禁。
 */
const TITLEBAR_SOURCE_URL = new URL('../src/renderer/src/app/constants.ts', import.meta.url)

/** 对比度棘轮基线（记录已接受的低对比组合） */
export const BASELINE_URL = new URL(
  '../docs/development/theme-contrast-baseline.json',
  import.meta.url,
)

/**
 * quiet-workspace 新增主题：由本次重构引入，直接按 WCAG 下限硬门禁，
 * 不享受既有主题的存量豁免。
 */
export const QUIET_THEMES = ['mist', 'pine']

/** 每个主题都必须声明的颜色 token（缺失即失败，防新增主题漏 token） */
export const REQUIRED_TOKENS = [
  'bg-app',
  'bg-surface',
  'bg-sidebar',
  'bg-menu',
  'text-1',
  'text-2',
  'text-3',
  'text-4',
  'accent',
  'accent-bg',
  'success',
  'danger',
  'border',
  'border-m',
]

/** 可选 token：定义了才参与检查（quiet-workspace 专用的 accent-line） */
export const OPTIONAL_TOKENS = ['accent-line']

export const TEXT_TOKENS = ['text-1', 'text-2', 'accent', 'danger', 'success']

/** 只记录不门禁的弱化文字色 */
export const REPORT_TOKENS = ['text-3', 'text-4']

/**
 * 参与正文级门禁的表面：应用底 / 卡片面 / 侧栏 / 弹层（菜单、对话框、命令面板）。
 * 弹层必须单列——它是文字最密集、也最容易在换主题后被忽略的表面。
 */
export const SURFACES = ['bg-app', 'bg-surface', 'bg-sidebar', 'bg-menu']

export const THRESHOLDS = { text: 4.5, ui: 3 }

/** 低于门禁的比值允许比基线差多少（浮点抖动 / 四舍五入） */
export const BASELINE_MARGIN = 0.02

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const RGBA_RE = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i

/** 解析 `#rgb` / `#rrggbb` / `rgb()` / `rgba()`，返回 {r,g,b,a}（0-255，a 为 0-1） */
export const parseColor = (value) => {
  const raw = String(value).trim()
  if (HEX_RE.test(raw)) {
    const body = raw.slice(1)
    const full = body.length === 3 ? body.split('').map((c) => c + c).join('') : body
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    }
  }
  const match = raw.match(RGBA_RE)
  if (!match) throw new Error(`无法解析颜色：${raw}`)
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  }
}

/** 把带 alpha 的前景色合成到不透明背景之上（CSS 实际渲染结果） */
export const composite = (fg, bg) => {
  if (fg.a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 }
  const mix = (f, b) => Math.round(f * fg.a + b * (1 - fg.a))
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b), a: 1 }
}

const channel = (value) => {
  const srgb = value / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

export const relativeLuminance = ({ r, g, b }) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

/** WCAG 2.1 对比度（1-21），保留两位小数 */
export const contrastRatio = (a, b) => {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

/**
 * 从主题 CSS 文本中提取 token 表。
 *
 * 各主题的宿主选择器写法不统一（`:root, [data-theme="default"]` /
 * `[data-theme="atom"]` / `:root[data-theme="pine"]`），因此按「选择器块」扫描，
 * 只收选择器里出现 `:root` 或 `data-theme` 的块；同文件后出现的声明覆盖先出现的，
 * 与 CSS 级联在同一选择器组内的表现一致（主题文件自身不做跨文件合并）。
 */
export const parseThemeTokens = (css) => {
  const tokens = new Map()
  const blockRe = /([^{}]+)\{([^{}]*)\}/g
  for (const block of css.matchAll(blockRe)) {
    const selector = block[1]
    if (!selector.includes(':root') && !selector.includes('data-theme')) continue
    for (const decl of block[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      tokens.set(decl[1].slice(2), decl[2].trim())
    }
  }
  return tokens
}

export const readThemeTokens = async (fileName) => {
  const css = await readFile(new URL(fileName, THEMES_DIR), 'utf8')
  return parseThemeTokens(css)
}

export const listThemeFiles = async () => {
  const entries = await readdir(THEMES_DIR)
  return entries.filter((name) => name.endsWith('.css')).sort()
}

/** 主题中缺失的必需 token */
export const findMissingTokens = (tokens) =>
  REQUIRED_TOKENS.filter((token) => !tokens.has(token))

/**
 * 计算单个主题的全部检查项。
 * @returns {{ gated: Array, reported: Array }} gated 内的每一项都带 group 与 min
 */
export const evaluateTheme = (name, tokens) => {
  const missing = findMissingTokens(tokens)
  if (missing.length > 0) {
    throw new Error(`主题 ${name} 缺少 token：${missing.map((t) => `--${t}`).join(', ')}`)
  }

  const color = (token) => parseColor(tokens.get(token))
  const surfaces = SURFACES.map((token) => ({ token, color: color(token) }))
  const gated = []
  const reported = []

  const push = (pair, ratio, min, group) => gated.push({ theme: name, pair, ratio, min, group })

  for (const surface of surfaces) {
    for (const token of TEXT_TOKENS) {
      push(
        `${token} on ${surface.token}`,
        contrastRatio(composite(color(token), surface.color), surface.color),
        THRESHOLDS.text,
        'text',
      )
    }
    for (const token of REPORT_TOKENS) {
      reported.push({
        theme: name,
        pair: `${token} on ${surface.token}`,
        ratio: contrastRatio(composite(color(token), surface.color), surface.color),
        group: 'report',
      })
    }
  }

  // 边框与强调色块边界属于非文字 UI，3:1 即可辨识
  const surfaceColor = surfaces.find((item) => item.token === 'bg-surface').color
  const appColor = surfaces.find((item) => item.token === 'bg-app').color
  push(
    'border-m on bg-surface',
    contrastRatio(composite(color('border-m'), surfaceColor), surfaceColor),
    THRESHOLDS.ui,
    'ui',
  )
  // 焦点环 / 激活标记用 accent 描边，必须能从页面底色里分辨出来
  push(
    'accent on bg-app（图形元素）',
    contrastRatio(composite(color('accent'), appColor), appColor),
    THRESHOLDS.ui,
    'ui',
  )

  // 侧栏激活行：accent 文字落在 accent-bg 上，而 accent-bg 本身叠在 bg-sidebar 上
  const sidebarColor = surfaces.find((item) => item.token === 'bg-sidebar').color
  const accentBg = composite(color('accent-bg'), sidebarColor)
  push(
    'accent on accent-bg/bg-sidebar（激活行）',
    contrastRatio(composite(color('accent'), accentBg), accentBg),
    THRESHOLDS.text,
    'text',
  )

  // 可选 token：quiet-workspace 的激活标记线（图形化标识，3:1）
  if (tokens.has('accent-line')) {
    const sidebarColorInner = surfaces.find((item) => item.token === 'bg-sidebar').color
    push(
      'accent-line on bg-sidebar（激活标记线）',
      contrastRatio(composite(color('accent-line'), sidebarColorInner), sidebarColorInner),
      THRESHOLDS.ui,
      'ui',
    )
  }

  return { gated, reported }
}

/**
 * 从 `app/constants.ts` 解析 `TITLEBAR_COLORS`（Electron 系统标题栏 overlay 配色）。
 *
 * 这一项不落在主题 CSS 里，因此最容易被换主题时漏掉：新增主题加了 CSS token、
 * 忘了加标题栏配色，系统按钮就会直接用黑/白，出现「看不见的关闭按钮」。
 */
export const parseTitlebarColors = (source) => {
  const start = source.indexOf('TITLEBAR_COLORS')
  if (start < 0) return new Map()
  const colors = new Map()
  for (const match of source
    .slice(start)
    .matchAll(/(\w+):\s*\{\s*bg:\s*'([^']+)',\s*symbol:\s*'([^']+)'\s*\}/g)) {
    colors.set(match[1], { bg: match[2], symbol: match[3] })
  }
  return colors
}

export const readTitlebarColors = async () =>
  parseTitlebarColors(await readFile(TITLEBAR_SOURCE_URL, 'utf8'))

/**
 * 标题栏按钮（最小化/最大化/关闭）的图标色落在标题栏底色上，属于功能性图形，
 * 按 text 级 4.5:1 判定——看不清就等于点不到。
 */
export const evaluateTitlebar = (name, colors) => [
  {
    theme: name,
    pair: 'titlebar symbol on bg（系统标题栏按钮）',
    ratio: contrastRatio(parseColor(colors.symbol), parseColor(colors.bg)),
    min: THRESHOLDS.text,
    group: 'text',
  },
]

/** 读取棘轮基线；文件缺失时返回空基线（首次运行只按硬门禁判定） */
export const loadBaseline = async () => {
  try {
    const raw = await readFile(BASELINE_URL, 'utf8')
    const parsed = JSON.parse(raw)
    return { margin: parsed.margin ?? BASELINE_MARGIN, accepted: parsed.accepted ?? {} }
  } catch (error) {
    if (error.code === 'ENOENT') return { margin: BASELINE_MARGIN, accepted: {} }
    throw error
  }
}

/**
 * 扫描全部主题，按「硬门禁 + 棘轮」判定。
 *
 * @returns {Promise<object>} {
 *   themes, checks, reported, failures,  // failures = 真实失败（硬门禁未过且基线未豁免，或比基线更差）
 *   accepted,                            // 被基线豁免的项（存量债务）
 *   staleAccepted,                       // 已达标、可从基线移除的项
 *   missing,                             // 主题缺失 token
 * }
 */
export const checkThemes = async ({ baseline } = {}) => {
  const files = await listThemeFiles()
  const resolvedBaseline = baseline ?? (await loadBaseline())
  const margin = resolvedBaseline.margin ?? BASELINE_MARGIN
  const acceptedBaseline = resolvedBaseline.accepted ?? {}

  const themes = files.map((file) => file.replace(/\.css$/, ''))
  const checks = []
  const reported = []
  const missing = []

  for (const file of files) {
    const name = file.replace(/\.css$/, '')
    const tokens = await readThemeTokens(file)
    const absent = findMissingTokens(tokens)
    if (absent.length > 0) {
      missing.push({ theme: name, tokens: absent })
      continue
    }
    const result = evaluateTheme(name, tokens)
    checks.push(...result.gated)
    reported.push(...result.reported)
  }

  // 系统标题栏配色不在主题 CSS 里，单独解析后并入同一套判定
  const titlebar = await readTitlebarColors()
  for (const name of themes) {
    const colors = titlebar.get(name)
    if (!colors) {
      missing.push({ theme: name, tokens: ['TITLEBAR_COLORS'] })
      continue
    }
    checks.push(...evaluateTitlebar(name, colors))
  }

  const failures = []
  const accepted = []
  const staleAccepted = []

  for (const check of checks) {
    if (check.ratio >= check.min) {
      // 已达标：若基线仍登记着它，提示可以清理
      if (acceptedBaseline[check.theme]?.[check.pair] !== undefined) {
        staleAccepted.push(check)
      }
      continue
    }
    const floor = acceptedBaseline[check.theme]?.[check.pair]
    if (floor === undefined) {
      failures.push({ ...check, reason: '未达硬门禁且未登记基线' })
    } else if (check.ratio < floor - margin) {
      failures.push({ ...check, reason: `比基线 ${floor} 更差`, floor })
    } else {
      accepted.push({ ...check, floor })
    }
  }

  return { themes, checks, reported, failures, accepted, staleAccepted, missing }
}

/** 人类可读报告（CLI 与测试失败信息共用） */
export const formatReport = (result) => {
  const lines = []
  lines.push(`主题： ${result.themes.join(', ')}`)
  lines.push(
    `检查项 ${result.checks.length}（其中被基线豁免 ${result.accepted.length}），失败 ${result.failures.length}`,
  )
  if (result.missing.length > 0) {
    lines.push('缺失 token：')
    for (const item of result.missing) lines.push(`  ${item.theme}: ${item.tokens.join(', ')}`)
  }
  for (const failure of result.failures) {
    lines.push(
      `  FAIL ${failure.theme.padEnd(11)} ${failure.pair}  ${failure.ratio} < ${failure.min}（${failure.reason}）`,
    )
  }
  if (result.accepted.length > 0) {
    lines.push('--- 存量债务（已登记基线，只需不变差） ---')
    for (const item of result.accepted) {
      lines.push(`  debt ${item.theme.padEnd(11)} ${item.pair}  ${item.ratio}（下限 ${item.floor}）`)
    }
  }
  if (result.staleAccepted.length > 0) {
    lines.push('--- 已达标、可从基线移除 ---')
    for (const item of result.staleAccepted) lines.push(`  fix  ${item.theme.padEnd(11)} ${item.pair}`)
  }
  lines.push('--- 仅记录（弱化文字，无门禁） ---')
  for (const item of result.reported) {
    lines.push(`  ${item.theme.padEnd(11)} ${item.pair}  ${item.ratio}`)
  }
  return lines.join('\n')
}

/** 直接运行时输出报告并以退出码表达结论 */
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isDirectRun) {
  const result = await checkThemes()
  process.stdout.write(`${formatReport(result)}\n`)
  const failed = result.failures.length > 0 || result.missing.length > 0
  process.stdout.write(failed ? '\n主题对比度门禁：失败\n' : '\n主题对比度门禁：通过\n')
  process.exitCode = failed ? 1 : 0
}
