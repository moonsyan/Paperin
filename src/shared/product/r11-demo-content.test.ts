import { describe, expect, it } from 'vitest'
import {
  buildProductOldNoteMarkdown,
  buildProductSourceAMarkdown,
  buildProductTechNoteMarkdown,
  R11_DEMO_FILE_IDS,
} from './r11-demo-content'

describe('生产首屏 R11 示例正文', () => {
  it('可读可搜索，不含测试夹具标记', () => {
    expect(buildProductSourceAMarkdown()).toContain('缓存失效')
    expect(buildProductSourceAMarkdown()).not.toMatch(/R11_SYNTH_/)
    expect(buildProductTechNoteMarkdown()).toContain('缓存失效')
    expect(buildProductTechNoteMarkdown()).not.toMatch(/R11_SYNTH_/)
    expect(buildProductOldNoteMarkdown()).not.toMatch(/R11_SYNTH_/)
    expect(R11_DEMO_FILE_IDS.sourceA).toBe('r11-source-a')
  })
})
