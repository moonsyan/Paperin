import { describe, expect, it } from 'vitest'
import { parseOutline, parseOutlineHeadings, scanOutlineBlocks } from './outline'

describe('文档大纲', () => {
  it('忽略代码围栏内的伪标题并保留引用标题', () => {
    const outline = parseOutline('# 标题\n```ts\n# 伪标题\n```\n> ## 引用标题')

    expect(outline).toEqual([
      {
        idx: 0,
        level: 1,
        text: '标题',
        children: [{ idx: 1, level: 2, text: '引用标题', children: [] }],
      },
    ])
  })

  it('可在合理时间内解析长文档', () => {
    const content = Array.from({ length: 20000 }, (_, index) => `## 标题 ${index}`).join('\n')
    const startedAt = performance.now()
    const outline = parseOutline(content)

    expect(outline).toHaveLength(20000)
    expect(performance.now() - startedAt).toBeLessThan(1500)
  })

  it('tab 缩进不是标题（CommonMark tab=4 空格=缩进代码块）', () => {
    const outline = parseOutline('\t# 伪标题\n## 真标题')
    expect(outline).toEqual([{ idx: 0, level: 2, text: '真标题', children: [] }])
  })

  it('支持 setext 标题（渲染层生成真实 h1/h2，缺失会导致大纲索引错位）', () => {
    const outline = parseOutline('一级标题\n===\n\n正文段落\n--\n\n## ATX 标题')
    expect(outline).toEqual([
      {
        idx: 0,
        level: 1,
        text: '一级标题',
        children: [
          { idx: 1, level: 2, text: '正文段落', children: [] },
          { idx: 2, level: 2, text: 'ATX 标题', children: [] },
        ],
      },
    ])
  })

  it('围栏关闭行后的 === 不是 setext；独立 --- 才是分隔线，段落后的 --- 是 h2', () => {
    const outline = parseOutline('text\n```\ncode\n```\n===\n\n前文\n---')
    expect(outline).toEqual([{ idx: 0, level: 2, text: '前文', children: [] }])
  })

  it('列表项不算段落，其后不产生 setext', () => {
    const outline = parseOutline('- item\n===')
    expect(outline).toEqual([])
  })

  it('4 反引号围栏内的 ``` 内容行不关栏，伪标题不进大纲', () => {
    const outline = parseOutline('````md\n# 栏内伪标题\n```\n# 仍是栏内伪标题\n````\n# 真标题')
    expect(outline).toEqual([{ idx: 0, level: 1, text: '真标题', children: [] }])
  })

  it('~~~ 栏不能用 ``` 关闭，反之亦然', () => {
    const outline = parseOutline('~~~\n# 伪标题\n```\n# 仍是伪标题\n~~~\n# 真标题')
    expect(outline).toEqual([{ idx: 0, level: 1, text: '真标题', children: [] }])
  })

  it('列表项内的标题不进大纲（DOM 侧定位需同步跳过，否则索引错位）', () => {
    // `- # foo` / `1. ## list-head` 在渲染层是真实 h1/h2，大纲按 Markdown
    // 行规则不收录；# root 与 ### tail 仍按层级入树
    const outline = parseOutline('- # foo\n\n# root\n\n1. ## list-head\n\n### tail')
    expect(outline).toEqual([
      {
        idx: 0,
        level: 1,
        text: 'root',
        children: [{ idx: 1, level: 3, text: 'tail', children: [] }],
      },
    ])
  })

  it('引用块内标题进大纲（DOM 侧保留）', () => {
    const outline = parseOutline('> # quoted\n\n# root')
    expect(outline.map((n) => n.text)).toEqual(['quoted', 'root'])
  })

  it('setext 与 ATX 混合时索引按层级入树（DOM h1-h4 枚举同序）', () => {
    const outline = parseOutline('Setext\n====\n\n# ATX\n\nMore\n----')
    expect(outline).toEqual([
      { idx: 0, level: 1, text: 'Setext', children: [] },
      {
        idx: 1,
        level: 1,
        text: 'ATX',
        children: [{ idx: 2, level: 2, text: 'More', children: [] }],
      },
    ])
  })
})

describe('parseOutlineHeadings 扁平标题与行号', () => {
  it('ATX 标题带物理行号，textLine 与 line 相同', () => {
    const headings = parseOutlineHeadings('# 一\n\n正文\n## 二')
    expect(headings).toEqual([
      { level: 1, text: '一', line: 1, textLine: 1 },
      { level: 2, text: '二', line: 4, textLine: 4 },
    ])
  })

  it('setext 标题 textLine 指向上方段落行', () => {
    const headings = parseOutlineHeadings('段落文字\n===\n正文')
    expect(headings).toEqual([{ level: 1, text: '段落文字', line: 2, textLine: 1 }])
  })

  it('scanOutlineBlocks 标记 frontmatter 与围栏行', () => {
    const blocks = scanOutlineBlocks('---\ntitle: x\n---\n正文\n```\n代码\n```')
    expect(blocks.map((b) => b.block)).toEqual([
      'frontmatter',
      'frontmatter',
      'frontmatter',
      null,
      'fence',
      'fence',
      'fence',
    ])
  })
})
