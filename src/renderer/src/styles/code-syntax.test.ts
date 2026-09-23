import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const syntax = readFileSync(join(process.cwd(), 'src/renderer/src/styles/code-syntax.css'), 'utf8')
const light = readFileSync(join(process.cwd(), 'src/renderer/src/styles/themes/code-palette-light.css'), 'utf8')
const dark = readFileSync(join(process.cwd(), 'src/renderer/src/styles/themes/code-palette-dark.css'), 'utf8')
const editor = readFileSync(join(process.cwd(), 'src/renderer/src/styles/components/editor.css'), 'utf8')

describe('code syntax theme contract', () => {
  it('maps tokens to semantic --code-* variables only', () => {
    expect(syntax).toContain('var(--code-string')
    expect(syntax).toContain('var(--code-keyword')
    expect(syntax).toContain('.editor-inner .milkdown pre code .token.string')
    expect(syntax).not.toMatch(/color:\s*#[0-9a-fA-F]{3,8}/)
  })

  it('defines light and dark palettes with keyword tied to accent', () => {
    expect(light).toContain('--code-keyword: var(--accent-h)')
    expect(dark).toContain('--code-keyword: var(--accent-h)')
    expect(light).toContain('--code-string:')
    expect(dark).toContain('--code-string:')
    expect(dark).toContain(":root[data-theme='dark']")
    expect(dark).toContain(":root[data-theme='github']")
    expect(dark).toContain(":root[data-theme='atom']")
    expect(dark).toContain(":root[data-theme='pine']")
    for (const theme of ['default', 'ocean', 'rose', 'typewriter', 'mist'] as const) {
      expect(light).toContain(`:root[data-theme='${theme}']`)
    }
  })

  it('does not keep hardcoded prism token colors in editor.css', () => {
    expect(editor).not.toContain('.token.string')
    expect(editor).toContain('code-syntax.css')
  })
})
