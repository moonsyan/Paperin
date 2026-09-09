import { Schema } from '@milkdown/kit/prose/model'
import { EditorState } from '@milkdown/kit/prose/state'
import { describe, expect, it } from 'vitest'
import {
  addImagePlaceholder,
  getImagePlaceholderPosition,
  imagePlaceholderPlugin,
  replaceImagePlaceholder,
} from './imagePlaceholder'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    image: { inline: true, group: 'inline', atom: true, attrs: { src: {}, alt: { default: '' } } },
  },
})

const createState = (text: string): EditorState =>
  EditorState.create({
    doc: schema.node('doc', null, schema.node('paragraph', null, schema.text(text))),
    plugins: [imagePlaceholderPlugin],
  })

describe('图片插入位置占位符', () => {
  it('后续在同一位置输入文本后仍保留原始插入位置', () => {
    const id = 'image-1'
    let state = createState('开头结尾')
    state = state.apply(addImagePlaceholder(state, id, 3))
    state = state.apply(state.tr.insertText('新增', 3))

    expect(getImagePlaceholderPosition(state, id)).toBe(3)
  })

  it('在映射后的位置插入图片并移除占位符', () => {
    const id = 'image-1'
    let state = createState('开头结尾')
    state = state.apply(addImagePlaceholder(state, id, 3))
    state = state.apply(state.tr.insertText('新增', 3))
    const transaction = replaceImagePlaceholder(state, id, {
      src: 'images/picture.png',
      alt: 'picture',
    })

    expect(transaction).not.toBeNull()
    const next = state.apply(transaction!)
    expect(next.doc.firstChild?.child(0).type.name).toBe('text')
    expect(next.doc.firstChild?.child(1).type.name).toBe('image')
    expect(getImagePlaceholderPosition(next, id)).toBeNull()
  })
})
