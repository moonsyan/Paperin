import { describe, expect, it } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import {
  blockAnchorFor,
  positionForBlockAnchor,
  positionForSourceLine,
  sourceLineCount,
} from './editor-doc-position'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { attrs: { level: { default: 1 } }, content: 'inline*', group: 'block' },
    frontmatter: { content: 'text*', group: 'block' },
    hardbreak: { inline: true, group: 'inline' },
  },
})

const para = (text: string) => schema.nodes.paragraph.create(null, text ? schema.text(text) : null)
const docOf = (...children: ReturnType<typeof para>[]) => schema.nodes.doc.create(null, children)

describe('块锚点', () => {
  it('整篇替换后仍把光标恢复到对应块内偏移', () => {
    const before = docOf(para('一二三'), para('旧内容'), para('尾巴'))
    const caret = para('一二三').nodeSize + 2
    const anchor = blockAnchorFor(before, caret)

    expect(anchor).toEqual({ blockIndex: 1, offsetInBlock: 1 })

    const after = docOf(para('一二三四五六'), para('全新内容更长'), para('尾巴'))
    const secondBlockContentStart = 1 + para('一二三四五六').nodeSize

    expect(positionForBlockAnchor(after, anchor)).toBe(secondBlockContentStart + 1)
  })

  it('文档开头位置锚定首块起始', () => {
    expect(blockAnchorFor(docOf(para('正文')), 0)).toEqual({ blockIndex: 0, offsetInBlock: 0 })
  })

  it('越过末块的位置钳到末块尾部', () => {
    const doc = docOf(para('甲'), para('乙'))
    const anchor = blockAnchorFor(doc, doc.content.size)

    expect(anchor.blockIndex).toBe(1)
    expect(positionForBlockAnchor(doc, anchor)).toBe(doc.content.size - 1)
  })

  it('新文档块数更少时钳到文档尾', () => {
    const doc = docOf(para('唯一块'))

    expect(positionForBlockAnchor(doc, { blockIndex: 5, offsetInBlock: 3 })).toBe(
      doc.content.size - 1,
    )
  })
})

describe('sourceLineCount', () => {
  it('文本按换行拆行，硬换行计 1 行', () => {
    expect(sourceLineCount(schema.text('第一行\n第二行'))).toBe(2)
    expect(sourceLineCount(schema.nodes.hardbreak.create())).toBe(1)
  })

  it('frontmatter 计入上下围栏两行', () => {
    const frontmatter = schema.nodes.frontmatter.create(null, schema.text('a: 1\nb: 2'))

    expect(sourceLineCount(frontmatter)).toBe(4)
  })

  it('空块至少占 1 行', () => {
    expect(sourceLineCount(para(''))).toBe(1)
  })
})

describe('positionForSourceLine', () => {
  const doc = docOf(para('甲'), para('乙'))
  const secondBlockContentStart = para('甲').nodeSize + 1

  it('首行定位到首块内容起点', () => {
    expect(positionForSourceLine(doc, 1)).toBe(1)
  })

  it('跨过块间空行后定位到次块内容起点', () => {
    expect(positionForSourceLine(doc, 4)).toBe(secondBlockContentStart)
  })

  it('越界与非法行号钳到文档尾', () => {
    expect(positionForSourceLine(doc, 99)).toBe(doc.content.size)
    expect(positionForSourceLine(doc, 0)).toBe(doc.content.size)
    expect(positionForSourceLine(doc, Number.NaN)).toBe(doc.content.size)
  })
})
