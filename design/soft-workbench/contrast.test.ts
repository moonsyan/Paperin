import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8')
const luminance = (hex: string): number => {
  const rgb = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}
const contrast = (a: string, b: string): number => {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + .05) / (values[1] + .05)
}

describe('原型两主题语义对比度', () => {
  for (const [name, selector] of [['雾白', '.workbench {'], ['夜松', ".workbench[data-theme='night'] {"]]) {
    it(`${name} 的正文、次文字、选中项和输入边界可辨识`, () => {
      const block = css.slice(css.indexOf(selector)).split('}')[0]
      const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+): #([0-9a-f]{6})[;]/g)].map(match => [match[1], match[2]]))
      for (const surface of ['canvas', 'sidebar', 'surface', 'hover']) {
        for (const foreground of ['text', 'muted', 'accent']) {
          expect(contrast(tokens[foreground], tokens[surface]), `${foreground} on ${surface}`).toBeGreaterThanOrEqual(4.5)
        }
      }
      expect(contrast(tokens.accent, tokens.selected)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens.accent, tokens.quote)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(tokens['input-border'], tokens.canvas)).toBeGreaterThanOrEqual(3)
    })
  }
})
