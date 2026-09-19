import { describe, expect, it } from 'vitest'
import { isMermaidErrorSvg, mermaidFailureKind, mermaidStatusText, sanitizeMermaidSource, sanitizeMermaidSvg } from './mermaid-source'

describe('sanitizeMermaidSource', () => {
  it('去掉共同缩进、零宽字符和会改全局配置的 init', () => {
    const source = [
      '  %%{init: {"theme":"dark"}}%%',
      '  graph TD',
      '    A[开始\u200b] --> B',
      '',
    ].join('\n')
    expect(sanitizeMermaidSource(source)).toBe('graph TD\n  A[开始] --> B')
  })

  it('不把围栏本身交给 Mermaid', () => {
    expect(sanitizeMermaidSource('```mermaid\ngraph LR\n  A-->B\n```')).toBe('graph LR\n  A-->B')
  })
})

describe('mermaid 失败说明', () => {
  it('内部渲染故障不叫语法错误', () => {
    expect(mermaidFailureKind('fragments are not allowed in template')).toBe('temporary')
    expect(mermaidStatusText(new Error('Syntax error in text'))).not.toContain('语法错误')
    expect(mermaidStatusText(new Error('Parse error on line 2'))).toContain('Parse error on line 2')
    expect(isMermaidErrorSvg('<svg>Syntax error in text</svg>')).toBe(true)
    const cleaned = sanitizeMermaidSvg('<svg><script>alert(1)</script><rect onclick="alert(1)" /></svg>')
    expect(cleaned?.startsWith('<svg')).toBe(true)
    expect(cleaned).not.toContain('script')
    expect(cleaned).not.toContain('onclick')
    expect(sanitizeMermaidSvg('<div>不是图</div>')).toBeNull()
  })
})
