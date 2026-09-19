// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  Editor as MilkdownCore,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { getPasteMarkdown, isMarkdownPasteText, markdownPastePlugin, prefersPlainMarkdown } from './markdownPaste'

const createClipboardEvent = (markdown: string, html = ''): ClipboardEvent => {
  const clipboardData = {
    files: [],
    getData: (type: string) => (type === 'text/plain' ? markdown : html),
  } as unknown as DataTransfer
  return { clipboardData, preventDefault: () => undefined } as ClipboardEvent
}

describe('markdownPastePlugin', () => {
  it('HTML 富文本不含 Markdown 结构时交给默认粘贴处理', () => {
    expect(isMarkdownPasteText('普通网页文本', '<p>普通网页文本</p>', false, 'normal')).toBe(true)
  })

  it('带图片文件时不抢占图片粘贴流程', () => {
    expect(isMarkdownPasteText('# 标题', '', true, 'normal')).toBe(false)
  })

  it('网页 HTML 转换为 Markdown，代码块按纯文本处理', () => {
    const clipboard = {
      files: [],
      getData: (type: string) => (type === 'text/plain' ? '普通文本' : '<p><strong>粗体</strong></p>'),
    } as unknown as DataTransfer
    expect(getPasteMarkdown(clipboard, 'normal')).toBe('**粗体**')
    expect(getPasteMarkdown(clipboard, 'code')).toBe('普通文本')
  })

  it('剪贴板没有纯文本时仍转换 HTML', () => {
    expect(isMarkdownPasteText('', '<p>网页内容</p>', false, 'normal')).toBe(true)
  })

  it('Windows、macOS 和 Linux 把 Markdown 原文包进 HTML 时仍按原文排版', () => {
    const markdown = '# 标题\n\n**强调**\n\n- 项目'
    const html = '<html><body><!--StartFragment--># 标题<br><br>**强调**<br><br>- 项目<!--EndFragment--></body></html>'
    expect(prefersPlainMarkdown(markdown, html)).toBe(true)
    expect(prefersPlainMarkdown('标题\n强调', '<h1>标题</h1><p><strong>强调</strong></p>')).toBe(false)
    expect(prefersPlainMarkdown('# 标题', `<div>${'正文'.repeat(80)}# 标题</div>`)).toBe(false)
    expect(prefersPlainMarkdown('# 标题', '<span>&#x23; 标题</span>')).toBe(true)
    const clipboard = {
      files: [],
      getData: (type: string) => (type === 'text/plain' ? markdown : html),
    } as unknown as DataTransfer
    expect(getPasteMarkdown(clipboard, 'normal')).toBe(markdown)
  })

  it('将纯文本 Markdown 粘贴内容解析为结构化节点', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const editor = MilkdownCore.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, '')
      })
      .use(commonmark)
      .use(gfm)
      .use(markdownPastePlugin)

    await editor.create()
    const view = editor.action((ctx) => ctx.get(editorViewCtx))
    const handled = view.someProp('handlePaste', (handler) =>
      handler(view, createClipboardEvent('# 标题\n\n- 项目'), view.state.selection.content()),
    )

    expect(handled).toBe(true)
    expect(view.state.doc.firstChild?.type.name).toBe('heading')
    expect(view.state.doc.firstChild?.textContent).toBe('标题')
    expect(view.state.doc.child(1).type.name).toBe('bullet_list')

    await editor.destroy()
    root.remove()
  })
})
