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
import {
  getPasteMarkdown,
  isMarkdownPasteText,
  looksLikeMarkdown,
  markdownPastePlugin,
  prefersPlainMarkdown,
} from './markdownPaste'

const createClipboardEvent = (markdown: string, html = ''): ClipboardEvent => {
  const clipboardData = {
    files: [],
    getData: (type: string) => (type === 'text/plain' ? markdown : html),
  } as unknown as DataTransfer
  return { clipboardData, preventDefault: () => undefined } as ClipboardEvent
}

const clipboardOf = (plain: string, html: string): DataTransfer =>
  ({
    files: [],
    getData: (type: string) => (type === 'text/plain' ? plain : html),
  }) as unknown as DataTransfer

describe('markdownPastePlugin', () => {
  it('HTML 富文本不含 Markdown 结构时交给默认粘贴处理', () => {
    expect(isMarkdownPasteText('普通网页文本', '<p>普通网页文本</p>', false, 'normal')).toBe(true)
  })

  it('带图片文件时不抢占图片粘贴流程', () => {
    expect(isMarkdownPasteText('# 标题', '', true, 'normal')).toBe(false)
  })

  it('网页 HTML 转换为 Markdown，代码块按纯文本处理', () => {
    expect(getPasteMarkdown(clipboardOf('普通文本', '<p><strong>粗体</strong></p>'), 'normal')).toBe(
      '**粗体**',
    )
    expect(getPasteMarkdown(clipboardOf('普通文本', '<p><strong>粗体</strong></p>'), 'code')).toBe(
      '普通文本',
    )
  })

  it('剪贴板没有纯文本时仍转换 HTML', () => {
    expect(isMarkdownPasteText('', '<p>网页内容</p>', false, 'normal')).toBe(true)
  })

  it('方案 C：plain 像 Markdown 时一律优先原文', () => {
    const markdown = '# 标题\n\n**强调**\n\n- 项目'
    const wrapped =
      '<html><body><!--StartFragment--># 标题<br><br>**强调**<br><br>- 项目<!--EndFragment--></body></html>'
    expect(looksLikeMarkdown(markdown)).toBe(true)
    expect(prefersPlainMarkdown(markdown, wrapped)).toBe(true)
    // 无标记 plain + 富文本 HTML → 不优先 plain（走 HTML 转换）
    expect(prefersPlainMarkdown('标题\n强调', '<h1>标题</h1><p><strong>强调</strong></p>')).toBe(false)
    // 有标记 plain + 任意 HTML（含长外壳、实体、渲染后的 h1）→ 仍用 plain
    expect(prefersPlainMarkdown('# 标题', `<div>${'包装'.repeat(40)}# 标题</div>`)).toBe(true)
    expect(prefersPlainMarkdown('# 标题', '<span>&#x23; 标题</span>')).toBe(true)
    expect(
      prefersPlainMarkdown('# 标题\n\n**强调**', '<h1>标题</h1><p><strong>强调</strong></p>'),
    ).toBe(true)
    expect(getPasteMarkdown(clipboardOf(markdown, wrapped), 'normal')).toBe(markdown)
  })

  it('各平台：纯文本像 Markdown 时优先原文，不被段落 HTML 转义掉标记', () => {
    const markdown = [
      '# API 说明',
      '',
      '请使用 **Bearer** token。',
      '',
      '- 第一步',
      '- 第二步',
      '',
      '```ts',
      'const ok = true',
      '```',
    ].join('\n')

    const winHtml = [
      '<html><body><!--StartFragment-->',
      '<p># API 说明</p>',
      '<p>请使用 **Bearer** token。</p>',
      '<p>- 第一步</p>',
      '<p>- 第二步</p>',
      '<p>```ts<br>const ok = true<br>```</p>',
      '<!--EndFragment--></body></html>',
    ].join('')

    const macHtml = [
      '<meta charset="utf-8">',
      '<div class="wrapper" data-paste="1">',
      markdown
        .split('\n')
        .map((line) => (line ? `<div>${line}</div>` : '<div><br></div>'))
        .join(''),
      '</div>',
      `<div aria-hidden="true">${'x'.repeat(120)}</div>`,
    ].join('')

    expect(prefersPlainMarkdown(markdown, winHtml)).toBe(true)
    expect(prefersPlainMarkdown(markdown, macHtml)).toBe(true)
    expect(getPasteMarkdown(clipboardOf(markdown, winHtml), 'normal')).toBe(markdown)
    expect(getPasteMarkdown(clipboardOf(markdown, macHtml), 'normal')).toBe(markdown)
  })

  it('应用内：无标记 plain + 渲染 HTML → HTML 转 MD；有标记 plain（serializer）→ 用 plain', () => {
    const renderedHtml =
      '<h1>欢迎使用 Paperin</h1><p>这段说明<strong>不会</strong>写入知识库。</p><ul><li><p>打开知识库</p></li></ul>'
    const textBetween = '欢迎使用 Paperin\n\n这段说明不会写入知识库。\n\n打开知识库'
    expect(looksLikeMarkdown(textBetween)).toBe(false)
    expect(getPasteMarkdown(clipboardOf(textBetween, renderedHtml), 'normal')).toContain('# 欢迎使用 Paperin')
    expect(getPasteMarkdown(clipboardOf(textBetween, renderedHtml), 'normal')).toContain('**不会**')

    const serialized = '# 欢迎使用 Paperin\n\n这段说明**不会**写入知识库。\n\n- 打开知识库'
    expect(getPasteMarkdown(clipboardOf(serialized, renderedHtml), 'normal')).toBe(serialized)
  })

  it('Word 式：无标记 plain + 语义 HTML → HTML 转 MD', () => {
    expect(
      getPasteMarkdown(
        clipboardOf('API 说明\nBearer', '<h1>API 说明</h1><p><strong>Bearer</strong></p>'),
        'normal',
      ),
    ).toBe('# API 说明\n\n**Bearer**')
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

  it('复制结构化选区时 clipboardTextSerializer 写出 Markdown 源码', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const editor = MilkdownCore.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, '# 标题\n\n**强调**')
      })
      .use(commonmark)
      .use(gfm)
      .use(markdownPastePlugin)

    await editor.create()
    const view = editor.action((ctx) => ctx.get(editorViewCtx))
    const slice = view.state.doc.slice(0, view.state.doc.content.size)
    const serialized = view.someProp('clipboardTextSerializer', (fn) => fn(slice, view))
    expect(serialized).toContain('# 标题')
    expect(serialized).toMatch(/\*\*强调\*\*/)

    await editor.destroy()
    root.remove()
  })
})
