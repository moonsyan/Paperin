import { describe, expect, it } from 'vitest'

import {
  BASELINE_MARGIN,
  QUIET_THEMES,
  REQUIRED_TOKENS,
  SURFACES,
  THRESHOLDS,
  checkThemes,
  composite,
  contrastRatio,
  evaluateTheme,
  loadBaseline,
  parseColor,
  parseThemeTokens,
  parseTitlebarColors,
  readTitlebarColors,
} from './theme-contrast.mjs'

/**
 * 主题对比度门禁的测试化。
 *
 * 这里守两件事：
 * 1. 九套主题的 token 齐全、且全部满足「硬门禁 + 棘轮基线」；
 * 2. 门禁本身不是空转——去掉基线或调淡某个 token 时它必须报错。
 */

/** quiet-workspace 新增主题唯一允许登记的存量债务（与旧主题保持一致的弱分割线） */
const QUIET_THEME_ALLOWED_DEBT = ['border-m on bg-surface']

describe('WCAG 对比度计算', () => {
  it('黑白对比度为 21，同色为 1', () => {
    expect(contrastRatio(parseColor('#000000'), parseColor('#ffffff'))).toBe(21)
    expect(contrastRatio(parseColor('#767676'), parseColor('#767676'))).toBe(1)
  })

  it('支持 #rgb / #rrggbb / rgb() / rgba() 四种写法', () => {
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 })
    expect(parseColor('#AABBCC')).toEqual({ r: 170, g: 187, b: 204, a: 1 })
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 })
    expect(parseColor('rgba(1, 2, 3, .5)')).toMatchObject({ r: 1, g: 2, b: 3, a: 0.5 })
  })

  it('半透明前景色先合成到背景上再算对比度', () => {
    const semi = composite(parseColor('rgba(0,0,0,.5)'), parseColor('#ffffff'))
    expect(semi).toEqual({ r: 128, g: 128, b: 128, a: 1 })
    // 纯黑是 21，半透明黑落到背景上后必然更低
    expect(contrastRatio(semi, parseColor('#ffffff'))).toBeLessThan(21)
  })

  it('越界颜色写法直接抛错，不静默当黑色处理', () => {
    expect(() => parseColor('var(--text-1)')).toThrow(/无法解析颜色/)
  })
})

describe('主题 token 解析', () => {
  it('同时支持 :root 与 [data-theme=...] 两种宿主选择器', () => {
    const fromRoot = parseThemeTokens(':root { --text-1: #111; --bg-app: #fff; }')
    expect(fromRoot.get('text-1')).toBe('#111')
    const fromAttr = parseThemeTokens('[data-theme="atom"] { --text-1: #222; }')
    expect(fromAttr.get('text-1')).toBe('#222')
    const fromBoth = parseThemeTokens(':root[data-theme="pine"] { --text-1: #333; }')
    expect(fromBoth.get('text-1')).toBe('#333')
  })

  it('忽略与主题无关的规则块', () => {
    const tokens = parseThemeTokens('.foo { --text-1: #111; } :root { --text-2: #222; }')
    expect(tokens.has('text-1')).toBe(false)
    expect(tokens.get('text-2')).toBe('#222')
  })
})

describe('九套主题对比度门禁', () => {
  it('每套主题都声明了全部必需 token', async () => {
    const result = await checkThemes()
    expect(result.missing).toEqual([])
    expect(result.themes).toEqual([
      'atom',
      'dark',
      'default',
      'github',
      'mist',
      'ocean',
      'pine',
      'rose',
      'typewriter',
    ])
    expect(REQUIRED_TOKENS).toContain('border-m')
    // 弹层表面必须参与正文级门禁：菜单/对话框/命令面板是文字最密集的地方
    expect(SURFACES).toContain('bg-menu')
  })

  it('门禁全部通过（低于下限的组合必须已在基线登记且未变差）', async () => {
    const result = await checkThemes()
    const detail = result.failures
      .map((item) => `${item.theme} ${item.pair}：${item.ratio}（${item.reason}）`)
      .join('\n')
    expect(detail).toBe('')
    expect(result.failures).toEqual([])
  })

  it('quiet-workspace 新增主题不能靠登记基线绕过门禁', async () => {
    const result = await checkThemes()
    for (const theme of QUIET_THEMES) {
      const debt = result.accepted.filter((item) => item.theme === theme).map((item) => item.pair)
      for (const pair of debt) {
        expect(
          QUIET_THEME_ALLOWED_DEBT,
          `${theme} 把「${pair}」登记为存量债务，但新增主题只允许登记 ${QUIET_THEME_ALLOWED_DEBT.join('、')}`,
        ).toContain(pair)
      }
    }
  })

  it('基线不腐化：已达标项不应继续留在豁免清单里', async () => {
    const result = await checkThemes()
    const stale = result.staleAccepted
      .map((item) => `${item.theme} / ${item.pair}`)
      .join('\n')
    expect(stale, '以下组合已达标，请从 theme-contrast-baseline.json 的 accepted 中删除').toBe('')
  })

  it('基线只登记确实低于门禁的组合', async () => {
    const baseline = await loadBaseline()
    expect(baseline.margin).toBe(BASELINE_MARGIN)
    const result = await checkThemes()
    const byKey = new Map(result.checks.map((item) => [`${item.theme}/${item.pair}`, item]))
    for (const [theme, entries] of Object.entries(baseline.accepted)) {
      for (const [pair, ratio] of Object.entries(entries)) {
        const check = byKey.get(`${theme}/${pair}`)
        expect(check, `基线里的 ${theme}/${pair} 已不存在于检查项中`).toBeDefined()
        expect(check.ratio).toBeLessThan(check.min)
        expect(ratio).toBeLessThan(check.min)
      }
    }
  })
})

describe('门禁不是空转', () => {
  it('去掉基线后，存量低对比组合会被判定为失败', async () => {
    const withBaseline = await checkThemes()
    const withoutBaseline = await checkThemes({ baseline: { margin: BASELINE_MARGIN, accepted: {} } })

    expect(withBaseline.failures).toEqual([])
    expect(withoutBaseline.failures.length).toBe(withBaseline.accepted.length)
    expect(withoutBaseline.failures.length).toBeGreaterThan(0)
  })

  it('比基线更差的取值会被拦下', async () => {
    const withBaseline = await checkThemes()
    const loosened = structuredClone(
      Object.fromEntries(
        Object.entries((await loadBaseline()).accepted).map(([theme, entries]) => [
          theme,
          { ...entries },
        ]),
      ),
    )
    // 把 typewriter 的 danger 下限抬到不可能达到的高度，模拟「改淡 danger」
    // （typewriter accent 债务已在 T12 清除，不再适合作为棘轮夹具）
    loosened.typewriter['danger on bg-sidebar'] = 4.4
    const result = await checkThemes({ baseline: { margin: BASELINE_MARGIN, accepted: loosened } })
    expect(
      result.failures.some(
        (item) => item.theme === 'typewriter' && item.pair === 'danger on bg-sidebar',
      ),
    ).toBe(true)
    expect(withBaseline.failures).toEqual([])
  })

  it('正文级文字调淡到看不清时，单主题评估就会低于门禁', async () => {
    const tokens = new Map([
      ['bg-app', '#ffffff'],
      ['bg-surface', '#ffffff'],
      ['bg-sidebar', '#ffffff'],
      ['bg-menu', '#ffffff'],
      ['text-1', '#c8c8c8'],
      ['text-2', '#8a8a8a'],
      ['text-3', '#999999'],
      ['text-4', '#cccccc'],
      ['accent', '#3C7154'],
      ['accent-bg', '#E2EEE5'],
      ['success', '#3C7154'],
      ['danger', '#B4483C'],
      ['border', '#E5E5E5'],
      ['border-m', '#D3DBD2'],
    ])
    const { gated } = evaluateTheme('mock', tokens)
    const text1 = gated.find((item) => item.pair === 'text-1 on bg-surface')
    expect(text1.ratio).toBeLessThan(THRESHOLDS.text)
  })

  it('弹层表面（bg-menu）单独参与正文级门禁', () => {
    const base = {
      'bg-app': '#ffffff',
      'bg-surface': '#ffffff',
      'bg-sidebar': '#eeeeee',
      'text-1': '#111111',
      'text-2': '#333333',
      'text-3': '#666666',
      'text-4': '#999999',
      'accent': '#3C7154',
      'accent-bg': '#E2EEE5',
      'success': '#3C7154',
      'danger': '#B4483C',
      'border': '#E5E5E5',
      'border-m': '#D3DBD2',
    }
    // 弹层用了浅底但文字仍是深色：pass
    const pass = evaluateTheme('mock', new Map([...Object.entries(base), ['bg-menu', '#fafafa']]))
    expect(pass.gated.some((item) => item.pair === 'text-1 on bg-menu')).toBe(true)
    // 弹层误用深底 + 深字：必须被判定为低对比
    const fail = evaluateTheme('mock', new Map([...Object.entries(base), ['bg-menu', '#222222']]))
    const menuCheck = fail.gated.find((item) => item.pair === 'text-1 on bg-menu')
    expect(menuCheck.ratio).toBeLessThan(THRESHOLDS.text)
  })

  it('缺少必需 token 的主题直接报错，而不是当成黑色参与计算', () => {
    const tokens = new Map([['bg-app', '#ffffff']])
    expect(() => evaluateTheme('broken', tokens)).toThrow(/缺少 token/)
  })
})

describe('系统标题栏配色', () => {
  it('解析 TITLEBAR_COLORS 映射', () => {
    const source = `
export const TITLEBAR_COLORS: Record<string, { bg: string; symbol: string }> = {
  default: { bg: '#F0EDEA', symbol: '#5C5850' },
  mist: { bg: '#EEF1EC', symbol: '#616C64' },
}
`
    const colors = parseTitlebarColors(source)
    expect(colors.get('default')).toEqual({ bg: '#F0EDEA', symbol: '#5C5850' })
    expect(colors.get('mist')).toEqual({ bg: '#EEF1EC', symbol: '#616C64' })
  })

  it('每个主题都必须有标题栏配色（漏掉就会出现看不见的系统按钮）', async () => {
    const colors = await readTitlebarColors()
    const result = await checkThemes()
    for (const theme of result.themes) {
      expect(colors.has(theme), `主题 ${theme} 缺少 TITLEBAR_COLORS 条目`).toBe(true)
    }
    // 反向也要成立：映射表里不应留下已删除主题的残条
    for (const name of colors.keys()) {
      expect(result.themes).toContain(name)
    }
  })

  it('标题栏按钮图标与底色达到正文级对比度', async () => {
    const colors = await readTitlebarColors()
    for (const [theme, value] of colors) {
      const ratio = contrastRatio(parseColor(value.symbol), parseColor(value.bg))
      expect(ratio, `主题 ${theme} 的标题栏按钮对比度仅 ${ratio}`).toBeGreaterThanOrEqual(
        THRESHOLDS.text,
      )
    }
  })
})
