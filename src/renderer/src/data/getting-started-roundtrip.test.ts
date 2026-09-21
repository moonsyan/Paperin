// @vitest-environment jsdom

import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { getMarkdown } from '@milkdown/kit/utils'
import { math } from '@milkdown/plugin-math'
import { describe, expect, it } from 'vitest'
import { buildGettingStartedMarkdown } from '../../../shared/product/getting-started'
import { ensureFootnoteDefinitions } from '../lib/footnote-normalize'
import {
  footnoteDefInputRule,
  footnoteOrphanAsRefPlugin,
  footnoteRefInputRule,
} from '../components/Editor/plugins/footnote'
import { wikiLinkSchema, wikiTextConvertPlugin } from '../components/Editor/plugins/wikiLink'

describe('入门正文编辑器往返', () => {
  it('与当前编辑器插件栈序列化后不改变原文', async () => {
    const markdown = buildGettingStartedMarkdown()
    expect(ensureFootnoteDefinitions(markdown)).toBe(markdown)
    const root = document.createElement('div')
    const editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, markdown)
      })
      .use(commonmark)
      .use(gfm)
      .use(math)
      .use([footnoteDefInputRule, footnoteRefInputRule])
      .use(footnoteOrphanAsRefPlugin)
      .use(wikiLinkSchema)
      .use(wikiTextConvertPlugin)
      .create()
    expect(editor.action(getMarkdown())).toBe(markdown)
  })
})
