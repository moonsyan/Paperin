// @vitest-environment jsdom

import { Editor as MilkdownCore, editorViewCtx } from '@milkdown/kit/core'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { describe, expect, it } from 'vitest'
import {
  createCodeFenceEnterTransaction,
  customCodeFenceKeymap,
  customCodeFenceRule,
} from './customCodeFence'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    code_block: {
      attrs: { language: { default: '' } },
      content: 'text*',
      group: 'block',
      code: true,
    },
  },
})

const createStateWithParagraph = (text: string): EditorState => {
  const paragraph = schema.node('paragraph', null, text ? schema.text(text) : undefined)
  const doc = schema.node('doc', null, paragraph)
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, text.length + 1),
  })
}

const typeText = (view: EditorView, text: string) => {
  for (const character of text) {
    const { from, to } = view.state.selection
    const handled = view.someProp('handleTextInput', (handleTextInput) =>
      handleTextInput(
        view,
        from,
        to,
        character,
        () => view.state.tr.insertText(character, from, to),
      ),
    )

    if (handled) continue
    view.dispatch(view.state.tr.insertText(character, from, to))
  }
}

const findCodeBlock = (view: EditorView) => {
  let codeBlockPosition: number | null = null
  view.state.doc.descendants((node, position) => {
    if (node.type.name !== 'code_block') return
    codeBlockPosition = position
    return false
  })
  return codeBlockPosition
}

const getCodeBlockTexts = (view: EditorView) => {
  const texts: string[] = []
  view.state.doc.descendants((node) => {
    if (node.type.name === 'code_block') texts.push(node.textContent)
  })
  return texts
}

const pressEnter = (view: EditorView) => {
  const event = new KeyboardEvent('keydown', { key: 'Enter' })
  return view.someProp('handleKeyDown', (handleKeyDown) => handleKeyDown(view, event))
}

describe('createCodeFenceEnterTransaction', () => {
  it('用唯一代码块替换三个反引号段落并将选区置入其中', () => {
    const transaction = createCodeFenceEnterTransaction(createStateWithParagraph('```typescript'))

    expect(transaction).not.toBeNull()
    expect(transaction?.doc.childCount).toBe(1)
    expect(transaction?.doc.firstChild?.type.name).toBe('code_block')
    expect(transaction?.doc.firstChild?.attrs.language).toBe('typescript')
    expect(transaction?.selection.from).toBe(1)
  })

  it('粘贴文本会写入围栏回车创建的同一代码块', () => {
    const transaction = createCodeFenceEnterTransaction(createStateWithParagraph('```'))
    const paste = transaction?.insertText('const answer = 42')

    expect(paste?.doc.childCount).toBe(1)
    expect(paste?.doc.firstChild?.type.name).toBe('code_block')
    expect(paste?.doc.firstChild?.textContent).toBe('const answer = 42')
  })

  it('保留波浪线围栏与语言名归一化，并忽略普通段落', () => {
    const tildeTransaction = createCodeFenceEnterTransaction(createStateWithParagraph('~~~Python'))

    expect(tildeTransaction?.doc.firstChild?.attrs.language).toBe('python')
    expect(createCodeFenceEnterTransaction(createStateWithParagraph('普通文本'))).toBeNull()
  })
})

describe('customCodeFenceRule', () => {
  it('连续输入三个波浪号会立即创建代码块，而不会触发删除线', async () => {
    const editor = MilkdownCore.make()
      .use(commonmark)
      .use(customCodeFenceRule)
      .use(gfm)

    await editor.create()
    const view = editor.ctx.get(editorViewCtx)

    typeText(view, '~~~')

    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.firstChild?.type.name).toBe('code_block')
    expect(view.state.selection.from).toBe(1)

    editor.destroy()
  })

  it('输入三个波浪号后继续输入会写入同一代码块', async () => {
    const editor = MilkdownCore.make()
      .use(commonmark)
      .use(customCodeFenceRule)
      .use(gfm)

    await editor.create()
    const view = editor.ctx.get(editorViewCtx)

    typeText(view, '~~~ ')

    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.firstChild?.type.name).toBe('code_block')
    expect(view.state.doc.firstChild?.textContent).toBe(' ')
    expect(view.state.selection.from).toBe(2)

    editor.destroy()
  })

  it('列表项中创建围栏后会将后续输入写入同一代码块', async () => {
    const editor = MilkdownCore.make()
      .use(commonmark)
      .use(customCodeFenceRule)
      .use(gfm)

    await editor.create()
    const view = editor.ctx.get(editorViewCtx)

    typeText(view, '- ~~~')
    typeText(view, 'const answer = 42')

    const codeBlockPosition = findCodeBlock(view)

    expect(codeBlockPosition).not.toBeNull()
    if (codeBlockPosition === null) throw new Error('未创建代码块')
    expect(view.state.selection.$from.parent.type.name).toBe('code_block')
    expect(view.state.doc.nodeAt(codeBlockPosition)?.textContent).toBe('const answer = 42')

    editor.destroy()
  })

  it('列表项中围栏按回车后会将后续输入写入同一代码块', async () => {
    const editor = MilkdownCore.make()
      .use(customCodeFenceKeymap)
      .use(commonmark)
      .use(customCodeFenceRule)
      .use(gfm)

    await editor.create()
    const view = editor.ctx.get(editorViewCtx)

    typeText(view, '- ```Python')
    expect(pressEnter(view)).toBe(true)
    typeText(view, 'const answer = 42')

    const codeBlockPosition = findCodeBlock(view)

    expect(codeBlockPosition).not.toBeNull()
    if (codeBlockPosition === null) throw new Error('未创建代码块')
    expect(view.state.selection.$from.parent.type.name).toBe('code_block')
    expect(view.state.doc.nodeAt(codeBlockPosition)?.textContent).toBe('const answer = 42')

    editor.destroy()
  })

  it('已有代码块后创建围栏不会把后续输入写入旧代码块', async () => {
    const editor = MilkdownCore.make()
      .use(commonmark)
      .use(customCodeFenceRule)
      .use(gfm)

    await editor.create()
    const view = editor.ctx.get(editorViewCtx)
    const { code_block: codeBlockType, paragraph: paragraphType } = view.state.schema.nodes
    const oldCodeBlock = codeBlockType.create(null, view.state.schema.text('old'))
    const replaceCodeBlock = view.state.tr.replaceWith(0, view.state.doc.content.size, oldCodeBlock)
    const transaction = replaceCodeBlock.insert(replaceCodeBlock.doc.content.size, paragraphType.create())

    view.dispatch(transaction.setSelection(TextSelection.atEnd(transaction.doc)))
    typeText(view, '~~~')
    typeText(view, 'new')

    expect(getCodeBlockTexts(view)).toEqual(['old', 'new'])
    expect(view.state.selection.$from.parent.type.name).toBe('code_block')

    editor.destroy()
  })

  it('已有代码块后围栏按回车不会把后续输入写入旧代码块', async () => {
    const editor = MilkdownCore.make()
      .use(customCodeFenceKeymap)
      .use(commonmark)
      .use(customCodeFenceRule)
      .use(gfm)

    await editor.create()
    const view = editor.ctx.get(editorViewCtx)
    const { code_block: codeBlockType, paragraph: paragraphType } = view.state.schema.nodes
    const oldCodeBlock = codeBlockType.create(null, view.state.schema.text('old'))
    const replaceCodeBlock = view.state.tr.replaceWith(0, view.state.doc.content.size, oldCodeBlock)
    const transaction = replaceCodeBlock.insert(replaceCodeBlock.doc.content.size, paragraphType.create())

    view.dispatch(transaction.setSelection(TextSelection.atEnd(transaction.doc)))
    typeText(view, '```')
    expect(pressEnter(view)).toBe(true)
    typeText(view, 'new')

    expect(getCodeBlockTexts(view)).toEqual(['old', 'new'])
    expect(view.state.selection.$from.parent.type.name).toBe('code_block')

    editor.destroy()
  })
})
