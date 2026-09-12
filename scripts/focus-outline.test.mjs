import { describe, expect, it } from 'vitest'

import {
  EXEMPTIONS,
  auditFile,
  auditStyles,
  formatReport,
  listStyleFiles,
  hasVisibleReplacement,
  parseDeclarations,
  parseRules,
} from './focus-outline.mjs'

/**
 * 焦点可见性门禁的测试化：既要扫出现有样式表的结论正确，
 * 也要证明这套判定对「抹掉轮廓又不补替代」的写法确实会失败。
 */

describe('样式表规则解析', () => {
  it('忽略注释：注释里的 outline: none 不应被当成真实声明', () => {
    const rules = parseRules('/* outline: none; 说明文字 */\n.a { color: red; }')
    expect(rules).toHaveLength(1)
    expect(rules[0].selector).toBe('.a')
    expect(rules[0].body).not.toContain('outline')
  })

  it('切分选择器组并压缩空白', () => {
    const rules = parseRules('.a,\n.b   {  outline :  none ; }')
    expect(rules[0].selector).toBe('.a, .b')
  })
})

describe('可见替代的判定', () => {
  it('outline: none / 0 / transparent 都不算可见', () => {
    expect(hasVisibleReplacement('outline: none;')).toBe(false)
    expect(hasVisibleReplacement('outline: 0;')).toBe(false)
    expect(hasVisibleReplacement('outline-color: transparent;')).toBe(false)
  })

  it('非 none 的 outline / box-shadow / border 才算', () => {
    expect(hasVisibleReplacement('outline: 2px solid red;')).toBe(true)
    expect(hasVisibleReplacement('box-shadow: 0 0 0 2px blue;')).toBe(true)
    expect(hasVisibleReplacement('box-shadow: none;')).toBe(false)
    expect(hasVisibleReplacement('border: 1px solid red;')).toBe(true)
    expect(hasVisibleReplacement('background: gray;')).toBe(false)
  })

  it('声明解析忽略空段与非法声明', () => {
    const declarations = parseDeclarations('color: red;; outline: none; transition:')
    expect(declarations.get('color')).toBe('red')
    expect(declarations.get('outline')).toBe('none')
  })
})

describe('单文件判定', () => {
  it('抹掉轮廓且无任何焦点兜底 → 违规', () => {
    const { violations } = auditFile('mock.css', '.btn { outline: none; color: red; }')
    expect(violations.map((item) => item.selector)).toEqual(['.btn'])
  })

  it('同文件里有 :focus-visible 的 outline 兜底 → 通过', () => {
    const css = '.btn { outline: none; }\n.btn:focus-visible { outline: 2px solid red; }'
    expect(auditFile('mock.css', css).violations).toEqual([])
  })

  it('box-shadow 光环算可见替代', () => {
    const css = '.field { outline: none; }\n.field:focus { box-shadow: 0 0 0 2px blue; }'
    expect(auditFile('mock.css', css).violations).toEqual([])
  })

  it('border-color 变化算可见替代', () => {
    const css = '.field { outline: none; }\n.field:focus { border-color: red; }'
    expect(auditFile('mock.css', css).violations).toEqual([])
  })

  it('焦点规则自己又抹掉轮廓且不给替代 → 违规', () => {
    const css = '.btn:hover, .btn:focus-visible { background: gray; outline: none; }'
    const { violations } = auditFile('mock.css', css)
    expect(violations).toHaveLength(1)
    expect(violations[0].kind).toMatch(/无可见替代/)
  })

  it('纯状态规则（:hover 等）不算基础规则', () => {
    expect(auditFile('mock.css', '.btn:hover { outline: none; }').violations).toEqual([])
    expect(auditFile('mock.css', '.btn:active { outline: none; }').violations).toEqual([])
  })

  it('选择器组里混有状态选择器时，只检查非状态部分', () => {
    const css = '.a:hover,\n.a { outline: none; }\n.a:focus-visible { outline: 1px solid red; }'
    expect(auditFile('mock.css', css).violations).toEqual([])
  })

  it('违规项带行号，便于人工跳转', () => {
    const { violations } = auditFile('mock.css', '/* x */\n\n.bad { outline: none; }')
    expect(violations[0].line).toBeGreaterThan(1)
  })
})

describe('全量样式表门禁', () => {
  it('所有抹掉轮廓的地方都有可见焦点兜底', async () => {
    const result = await auditStyles()
    const detail = result.violations
      .map((item) => `${item.file}:${item.line} ${item.selector}`)
      .join('\n')
    expect(detail).toBe('')
  })

  it('例外清单不腐化：每条豁免都仍命中', async () => {
    const result = await auditStyles()
    expect(result.staleExemptions).toEqual([])
    // 豁免必须是显式声明的，不能凭空多出未登记的例外
    const exempted = new Set(result.appliedExemptions.map((item) => `${item.file}::${item.selector}`))
    for (const key of exempted) {
      expect(EXEMPTIONS.map((item) => item.key)).toContain(key)
    }
    // 例外必须带理由
    for (const item of EXEMPTIONS) expect(item.reason.length).toBeGreaterThan(10)
  })

  it('确实扫到了样式表本身（避免路径错误导致的空扫通过）', async () => {
    const files = await listStyleFiles()
    expect(files.length).toBeGreaterThan(20)
    expect(files).toContain('components/editor.css')
    const result = await auditStyles()
    expect(result.hits.length).toBeGreaterThan(5)
  })

  it('报告文本包含结论细节', async () => {
    const result = await auditStyles()
    const report = formatReport(result)
    expect(report).toContain('扫描样式表')
    expect(report).toContain(`违规 ${result.violations.length}`)
  })
})
