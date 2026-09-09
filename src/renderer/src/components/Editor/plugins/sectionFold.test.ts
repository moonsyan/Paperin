import { describe, expect, it } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState } from '@milkdown/kit/prose/state'
import { buildFoldDecos } from './sectionFold'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
    },
  },
})

describe('章节折叠装饰', () => {
  it('标题离开视口后仍隐藏已折叠章节正文', () => {
    const heading = schema.nodes.heading.create({ level: 1 }, schema.text('标题'))
    const hiddenParagraph = schema.nodes.paragraph.create(null, schema.text('隐藏正文'))
    const nextHeading = schema.nodes.heading.create({ level: 1 }, schema.text('下一节'))
    const visibleParagraph = schema.nodes.paragraph.create(null, schema.text('显示正文'))
    const doc = schema.nodes.doc.create(null, [
      heading,
      hiddenParagraph,
      nextHeading,
      visibleParagraph,
    ])
    const state = EditorState.create({ schema, doc })
    const hiddenFrom = heading.nodeSize
    const decorations = buildFoldDecos(
      state,
      new Set([0]),
      { from: hiddenFrom + hiddenParagraph.nodeSize, to: doc.content.size },
    )

    const hidden = decorations.find(hiddenFrom, hiddenFrom + hiddenParagraph.nodeSize)
    const all = decorations.find()

    expect(hidden.some((deco) => (
      deco as unknown as { type: { attrs: { class?: string } } }
    ).type.attrs.class === 'folded-hidden')).toBe(true)
    expect(all.some((deco) => deco.from === 0 && deco.to === 0)).toBe(false)
  })
})
