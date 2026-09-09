import { describe, expect, it } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import { collectActiveHeading } from './editorHeadings'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
    blockquote: { content: 'block+', group: 'block' },
    bullet_list: { content: 'list_item+', group: 'block' },
    list_item: { content: 'block+' },
    text: { group: 'inline' },
  },
  marks: {},
})

/** 文档结构：
 *  # Root
 *  > ## Quoted          （引用块标题：大纲/光标都应计入）
 *  - # Listed           （列表项标题：大纲不收录，光标也不应计入）
 *  paragraph "Body"
 *  # Deep (level 5)     （h5 不参与大纲）
 */
const buildDoc = () =>
  schema.node('doc', null, [
    schema.node('heading', { level: 1 }, [schema.text('Root')]),
    schema.node('blockquote', null, [
      schema.node('heading', { level: 2 }, [schema.text('Quoted')]),
    ]),
    schema.node('bullet_list', null, [
      schema.node('list_item', null, [
        schema.node('heading', { level: 1 }, [schema.text('Listed')]),
      ]),
    ]),
    schema.node('paragraph', null, [schema.text('Body')]),
    schema.node('heading', { level: 5 }, [schema.text('Deep')]),
  ])

const posOfText = (doc: ReturnType<typeof buildDoc>, text: string): number => {
  let found = -1
  doc.descendants((node, pos) => {
    if (node.type.name === 'text' && node.text === text) {
      found = pos
      return false
    }
    return true
  })
  return found
}

describe('collectActiveHeading（与大纲 parseOutline 同口径）', () => {
  it('光标在普通标题内：返回自身与序号', () => {
    const doc = buildDoc()
    const pos = posOfText(doc, 'Root')
    expect(collectActiveHeading(doc, pos)).toEqual({ heading: 'Root', headingIndex: 0 })
  })

  it('光标在引用块标题内：计入（此前仅顶层扫描返回空/前一标题）', () => {
    const doc = buildDoc()
    const pos = posOfText(doc, 'Quoted')
    expect(collectActiveHeading(doc, pos)).toEqual({ heading: 'Quoted', headingIndex: 1 })
  })

  it('光标在列表项标题内：不计入该标题，回退到上一个可见标题', () => {
    const doc = buildDoc()
    const pos = posOfText(doc, 'Listed')
    expect(collectActiveHeading(doc, pos)).toEqual({ heading: 'Quoted', headingIndex: 1 })
  })

  it('光标在正文段落：返回其上方最后一个可见标题', () => {
    const doc = buildDoc()
    const pos = posOfText(doc, 'Body')
    expect(collectActiveHeading(doc, pos)).toEqual({ heading: 'Quoted', headingIndex: 1 })
  })

  it('h5 不参与计数（与大纲/DOM h1-h4 口径一致）', () => {
    const doc = buildDoc()
    const pos = posOfText(doc, 'Deep')
    expect(collectActiveHeading(doc, pos)).toEqual({ heading: 'Quoted', headingIndex: 1 })
  })

  it('光标位于文档最前：首个标题以 start=0 计为当前（upTo 含起点）', () => {
    const doc = buildDoc()
    // 与旧实现一致：upTo 含起点，光标未进入标题前（如空文档/段落前）
    // 以"起点不越过 upTo"为准，首个标题计入并高亮
    expect(collectActiveHeading(doc, 0)).toEqual({ heading: 'Root', headingIndex: 0 })
  })

  it('光标位于无标题文档最前：无标题', () => {
    const bare = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('text')]),
    ])
    expect(collectActiveHeading(bare, 0)).toEqual({ heading: '', headingIndex: -1 })
  })
})
