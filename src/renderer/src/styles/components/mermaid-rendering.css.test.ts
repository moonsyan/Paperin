import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(
  join(process.cwd(), 'src/renderer/src/styles/components/editor.css'),
  'utf8',
)

describe('Mermaid 图表样式', () => {
  it('按内容宽度显示 SVG，窄容器时再限制最大宽度', () => {
    const rule = stylesheet.match(/\.milkdown \.mermaid-preview svg\s*\{([\s\S]*?)\n\}/)
    const declarations = (rule?.[1] ?? '')
      .split('\n')
      .map((line) => line.replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter(Boolean)
      .join('\n')

    expect(declarations).toMatch(/width:\s*auto\s*;/)
    expect(declarations).toMatch(/max-width:\s*100%\s*;/)
    expect(declarations).not.toMatch(/(?:^|[^-])width:\s*100%\s*;/)
  })

  it('默认隐藏 Mermaid 源码块，仅在显式可见类时显示', () => {
    expect(stylesheet).toMatch(/\.milkdown \.mermaid-source-block\s*\{[\s\S]*?display:\s*none/)
    expect(stylesheet).toMatch(/\.milkdown \.mermaid-source-block\.is-source-visible\s*\{[\s\S]*?display:\s*block/)
  })
})
