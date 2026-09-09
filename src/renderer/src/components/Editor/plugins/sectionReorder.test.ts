import { describe, expect, it } from 'vitest'
import { Schema } from '@milkdown/kit/prose/model'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { EditorState } from '@milkdown/kit/prose/state'
import { history, undo } from 'prosemirror-history'
import { findSectionRange, moveSectionTo, sectionReorderKey, sectionReorderPlugin } from './sectionReorder'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    frontmatter: { attrs: { value: { default: '' } }, group: 'block' },
    text: { group: 'inline' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'inline*',
      group: 'block',
    },
    code_block: { content: 'inline*', group: 'block', code: true },
  },
})

const h = (level: number, text: string) => schema.nodes.heading.create({ level }, schema.text(text))
const p = (text: string) => schema.nodes.paragraph.create(null, schema.text(text))
const fm = (value: string) => schema.nodes.frontmatter.create({ value })

/** 顶层标题位置（按文本查找，1 起语义为文档偏移） */
const headingPos = (doc: PMNode, text: string): number => {
  let found = -1
  doc.forEach((node, offset) => {
    if (found < 0 && node.type.name === 'heading' && node.textContent === text) found = offset
  })
  return found
}

/** 顶层节点文本序列（含 frontmatter 的 value），用于断言"除顺序外逐字符一致" */
const childTexts = (doc: PMNode): string[] => {
  const texts: string[] = []
  doc.forEach((node) => texts.push(node.type.name === 'frontmatter' ? (node.attrs.value as string) : node.textContent))
  return texts
}

const buildDoc = (): PMNode =>
  schema.nodes.doc.create(null, [
    fm('title: 示例'),
    h(2, 'A'),
    p('A 正文'),
    h(2, 'B'),
    p('B 正文'),
    h(3, 'B1'),
    p('B1 正文'),
    h(2, 'C'),
    p('C 正文'),
  ])

describe('findSectionRange', () => {
  it('返回标题及其全部子内容区间（子级 H3 随动）', () => {
    const doc = buildDoc()
    const bPos = headingPos(doc, 'B')
    const cPos = headingPos(doc, 'C')
    // 光标放在标题文本内
    const range = findSectionRange(doc, bPos + 1)
    expect(range).toEqual({ from: bPos, to: cPos })
  })

  it('pos 在段落、frontmatter 或文档末尾时返回 null', () => {
    const doc = buildDoc()
    const aPos = headingPos(doc, 'A')
    expect(findSectionRange(doc, aPos + 4)).toBeNull() // "A 正文" 段落内
    expect(findSectionRange(doc, 0)).toBeNull() // frontmatter 内
    expect(findSectionRange(doc, doc.content.size)).toBeNull()
  })
})

describe('moveSectionTo', () => {
  it('同级 H2 整体搬移，子级 H3 与内容随动', () => {
    const doc = buildDoc()
    const bPos = headingPos(doc, 'B')
    const range = findSectionRange(doc, bPos + 1)!
    const aPos = headingPos(doc, 'A')
    const tr = moveSectionTo(doc, range, aPos)
    expect(tr).not.toBeNull()
    const next = tr!.doc
    // 新顺序：frontmatter、B（含正文与子级 B1）、A、C
    expect(childTexts(next)).toEqual([
      'title: 示例',
      'B', 'B 正文', 'B1', 'B1 正文',
      'A', 'A 正文',
      'C', 'C 正文',
    ])
    // frontmatter 保持首位
    expect(next.firstChild?.type.name).toBe('frontmatter')
  })

  it('移动到文档末尾（最后一个同级之后）', () => {
    const doc = buildDoc()
    const aPos = headingPos(doc, 'A')
    const range = findSectionRange(doc, aPos + 1)!
    const tr = moveSectionTo(doc, range, doc.content.size)
    expect(tr).not.toBeNull()
    expect(childTexts(tr!.doc)).toEqual([
      'title: 示例',
      'B', 'B 正文', 'B1', 'B1 正文',
      'C', 'C 正文',
      'A', 'A 正文',
    ])
  })

  it('移入自身子树或紧贴自身边界返回 null', () => {
    const doc = buildDoc()
    const bPos = headingPos(doc, 'B')
    const range = findSectionRange(doc, bPos + 1)!
    const b1Pos = headingPos(doc, 'B1')
    expect(moveSectionTo(doc, range, b1Pos)).toBeNull() // 自身子树内
    expect(moveSectionTo(doc, range, range.from)).toBeNull() // 自身起点
    expect(moveSectionTo(doc, range, range.to)).toBeNull() // 自身终点
  })

  it('跨父级移动同级标题被拒绝（同级之间排序）', () => {
    const doc = schema.nodes.doc.create(null, [
      h(1, 'X'),
      h(2, 'A'),
      h(1, 'Y'),
      h(2, 'C'),
    ])
    const aPos = headingPos(doc, 'A')
    const cPos = headingPos(doc, 'C')
    const range = findSectionRange(doc, aPos + 1)!
    // A 属于 X、C 属于 Y：同为 H2 但父级不同
    expect(moveSectionTo(doc, range, cPos)).toBeNull()
  })

  it('移动后重新序列化除顺序外逐字符一致', () => {
    const doc = buildDoc()
    const cPos = headingPos(doc, 'C')
    const range = findSectionRange(doc, cPos + 1)!
    const aPos = headingPos(doc, 'A')
    const tr = moveSectionTo(doc, range, aPos)!
    const sorted = (texts: string[]) => [...texts].sort()
    expect(sorted(childTexts(tr.doc))).toEqual(sorted(childTexts(doc)))
  })

  it('单次 dispatch 后一步撤销恢复原文档', () => {
    const doc = buildDoc()
    const state = EditorState.create({ schema, doc, plugins: [history()] })
    const bPos = headingPos(doc, 'B')
    const range = findSectionRange(doc, bPos + 1)!
    const aPos = headingPos(doc, 'A')
    const tr = moveSectionTo(doc, range, aPos)!
    expect(tr.steps.length).toBe(2) // 删除 + 插入，单事务一步撤销
    const moved = state.apply(tr)
    expect(moved.doc.textContent).not.toBe(doc.textContent)
    const restoredStates: EditorState[] = []
    undo(moved, (undoTr) => {
      restoredStates.push(moved.apply(undoTr))
    })
    expect(restoredStates[0]?.doc.toJSON()).toEqual(doc.toJSON())
  })

  it('目标位置不是同级标题起点时返回 null', () => {
    const doc = buildDoc()
    const cPos = headingPos(doc, 'C')
    const range = findSectionRange(doc, cPos + 1)!
    const bPos = headingPos(doc, 'B')
    // B 正文段落中间（level 不符也不是标题起点）
    expect(moveSectionTo(doc, range, bPos + 6)).toBeNull()
  })
})

describe('sectionReorderPlugin 拖拽手柄装饰', () => {
  it('顶层标题生成手柄，代码围栏内的伪标题不生成', () => {
    const doc = schema.nodes.doc.create(null, [
      h(2, '真标题'),
      p('正文'),
      schema.nodes.code_block.create(null, schema.text('# 伪标题')),
    ])
    const state = EditorState.create({ schema, doc, plugins: [sectionReorderPlugin] })
    const pluginState = sectionReorderKey.getState(state) as
      | { decos: { find: (from?: number, to?: number) => unknown[] } }
      | undefined
    expect(pluginState).toBeDefined()
    const decos = pluginState!.decos.find()
    // widget 装饰的 type 是 WidgetType（带 toDOM），node 装饰的 type 只有 attrs
    const widgetAt = (pos: number) =>
      decos.some((d) => (d as { from: number }).from === pos && typeof (d as { type?: { toDOM?: unknown } }).type?.toDOM === 'function')
    // 手柄位于标题内容首位（h.start + 1），保证标题相对定位 CSS 生效
    expect(widgetAt(1)).toBe(true) // 真标题有手柄
    const codePos = doc.content.size - schema.nodes.code_block.create(null, schema.text('# 伪标题')).nodeSize
    expect(widgetAt(codePos)).toBe(false) // 代码块没有手柄
    expect(widgetAt(codePos + 1)).toBe(false) // 代码内的伪标题也没有
  })
})
