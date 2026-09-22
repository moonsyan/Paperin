// @vitest-environment jsdom
// 临时复现脚本：模拟真实用户键入流，观察脚注 label 是否被截断为 1 个字符

import { describe, it } from 'vitest'
import {
  Editor as MilkdownCore,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { getMarkdown } from '@milkdown/kit/utils'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Editor } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import {
  footnoteDefInputRule,
  footnoteRefInputRule,
  footnoteRefClickPlugin,
  footnoteOrphanAsRefPlugin,
} from './footnote'

const build = async (md: string): Promise<{ view: EditorView; editor: Editor; root: HTMLElement }> => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = MilkdownCore.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
    })
    .use(commonmark)
    .use(gfm)
    .use([footnoteDefInputRule, footnoteRefInputRule])
    .use(footnoteRefClickPlugin)
    .use(footnoteOrphanAsRefPlugin)
  await editor.create()
  const view = editor.action((ctx) => ctx.get(editorViewCtx))
  return { view, editor, root }
}

const typeText = (view: EditorView, text: string) => {
  for (const character of text) {
    const { from, to } = view.state.selection
    const handled = view.someProp('handleTextInput', (handler) =>
      handler(view, from, to, character, () =>
        view.state.tr.insertText(character, from, to),
      ),
    )
    if (handled) continue
    view.dispatch(view.state.tr.insertText(character, from, to))
  }
}

const dump = (tag: string, view: EditorView, editor: Editor) => {
  const refs: string[] = []
  const defs: string[] = []
  view.state.doc.descendants((n) => {
    if (n.type.name === 'footnote_reference') refs.push(n.attrs.label)
    if (n.type.name === 'footnote_definition') defs.push(n.attrs.label)
  })
  console.log(`[${tag}]`)
  console.log(`  refs: [${refs.join(', ')}]  defs: [${defs.join(', ')}]`)
  console.log(`  textContent: ${JSON.stringify(view.state.doc.textContent)}`)
  console.log(`  markdown: ${JSON.stringify(editor.action(getMarkdown()))}`)
}

describe('复现：真实键入流', () => {
  it('A. 空文档行首键入 [^abc] + 空格 + 正文', async () => {
    const { view, editor } = await build('')
    view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)))
    typeText(view, '[^abc] 一些正文')
    dump('A 行首', view, editor)
  })

  it('B. 空文档行首键入 [^abc] 后换行再输入', async () => {
    const { view, editor } = await build('')
    view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)))
    typeText(view, '[^abc]')
    view.dispatch(view.state.tr.split(view.state.selection.from))
    typeText(view, '正文')
    dump('B 行首+换行', view, editor)
  })

  it('C. 行中键入 [^abc]（前面有文字）', async () => {
    const { view, editor } = await build('前文')
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)))
    typeText(view, ' [^abc]')
    dump('C 行中', view, editor)
  })

  it('D. 行中键入 [^abc] 后继续输入中文', async () => {
    const { view, editor } = await build('前文')
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)))
    typeText(view, ' [^abc]后续文字')
    dump('D 行中+中文', view, editor)
  })

  it('E. 行首键入单字符标签 [^a] + 空格', async () => {
    const { view, editor } = await build('')
    view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)))
    typeText(view, '[^a] 正文')
    dump('E 单字符', view, editor)
  })

  it('F. 已有脚注的文档里再键入第二个引用', async () => {
    const md = ['第一个[^one]。', '', '[^one]: 内容。'].join('\n')
    const { view, editor } = await build(md)
    view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)))
    typeText(view, '第二个[^two]。')
    dump('F 第二个', view, editor)
  })
})
