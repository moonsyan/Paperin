// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  Editor as MilkdownCore,
  defaultValueCtx,
  editorViewCtx,
  remarkPluginsCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { prism, prismConfig } from '@milkdown/plugin-prism'
import { $prose } from '@milkdown/kit/utils'

import { configureCodeBlockRefractor } from './syntaxHighlighting'
import {
  normalizeCodeLanguagePlugin,
  remarkNormalizeCodeLanguage,
} from './normalizeCodeLanguage'

describe('normalizeCodeLanguagePlugin + prism', () => {
  it('把围栏 JSON 归一成 json 并产出 token 装饰', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const md = ['```JSON', '{', '  "status": "success",', '  "code": 200', '}', '```'].join('\n')

    const editor = MilkdownCore.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, md)
        ctx.get(remarkPluginsCtx).push({
          plugin: remarkNormalizeCodeLanguage,
          options: {},
        } as never)
        ctx.set(prismConfig.key, {
          configureRefractor: configureCodeBlockRefractor,
        })
      })
      .use(commonmark)
      .use(prism)
      .use($prose(() => normalizeCodeLanguagePlugin))

    await editor.create()

    const view = editor.action((ctx) => ctx.get(editorViewCtx))

    let language = ''
    view.state.doc.descendants((node) => {
      if (node.type.name === 'code_block') language = String(node.attrs.language ?? '')
    })
    expect(language).toBe('json')

    const html = view.dom.innerHTML
    expect(html).toMatch(/token string/)
    expect(html).toMatch(/token property/)
    expect(html).toMatch(/token number/)
  })
})
