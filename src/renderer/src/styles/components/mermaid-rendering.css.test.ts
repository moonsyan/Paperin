import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(
  join(process.cwd(), 'src/renderer/src/styles/components/editor.css'),
  'utf8',
)

describe('Mermaid 图表样式', () => {
  it('保留 Mermaid SVG 的响应式宽度和内容最大宽度', () => {
    const rule = stylesheet.match(/\.milkdown \.mermaid-preview svg\s*\{([\s\S]*?)\n\}/)

    expect(rule?.[1]).toMatch(/width:\s*100%\s*;/)
    expect(rule?.[1]).toMatch(/max-width:\s*100%\s*;/)
    expect(rule?.[1]).not.toMatch(/width:\s*auto\s*!important\s*;/)
    expect(rule?.[1]).not.toMatch(/max-width:\s*none\s*!important\s*;/)
  })
})
