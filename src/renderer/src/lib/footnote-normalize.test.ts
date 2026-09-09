import { describe, expect, it } from 'vitest'
import { ensureFootnoteDefinitions } from './footnote-normalize'

describe('ensureFootnoteDefinitions（Typora 风格孤立引用补全）', () => {
  it('为孤立引用补占位定义', () => {
    const out = ensureFootnoteDefinitions('哈哈哈哈[^aaa]。')
    expect(out).toBe('哈哈哈哈[^aaa]。\n\n[^aaa]:\n')
    expect(out).toContain('[^aaa]:')
  })

  it('已有定义的引用不重复补', () => {
    const md = ['文字[^1]，补充。', '', '[^1]: 已有定义。'].join('\n')
    const out = ensureFootnoteDefinitions(md)
    expect(out).toBe(md)
  })

  it('幂等：再次调用不追加重复定义', () => {
    const once = ensureFootnoteDefinitions('孤立[^x]。')
    const twice = ensureFootnoteDefinitions(once)
    // 一轮后已有定义，二轮原样返回
    expect(twice).toBe(once)
    expect((twice.match(/\[\^x\]:/g) ?? []).length).toBe(1)
  })

  it('多个孤立引用分别补定义', () => {
    const out = ensureFootnoteDefinitions('a[^x] b[^y]。')
    expect(out).toContain('[^x]:')
    expect(out).toContain('[^y]:')
    expect((out.match(/\n\[\^[xy]\]:/g) ?? []).length).toBe(2)
  })

  it('不把图片替代文本 [^label] 误判为引用', () => {
    const md = '![示意图](img.png) 与 ![注](x.png) 以及 ![^n](y.png)'
    const out = ensureFootnoteDefinitions(md)
    // `!` 前缀的图片（含 alt 恰为 [^n] 的）都应按图片处理，不补定义
    expect(out).not.toContain('[^n]:')
  })

  it('转义的 \\[^label] 不当作引用', () => {
    const md = '字面 \\[^esc] 文本'
    const out = ensureFootnoteDefinitions(md)
    expect(out).not.toContain('[^esc]:')
  })

  it('空标签 [^] 不触发补全', () => {
    const md = '文本 [^] 结尾'
    const out = ensureFootnoteDefinitions(md)
    expect(out).toBe(md)
  })

  it('空输入原样返回', () => {
    expect(ensureFootnoteDefinitions('')).toBe('')
  })
})
