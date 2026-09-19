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
import { $prose } from '@milkdown/kit/utils'
import { structuredCodePlugin } from './structuredCodeBlock'

describe('structuredCodePlugin', () => {
  it('JSON 代码块提供格式化，点一下后展开缩进', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const editor = MilkdownCore.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, '```json\n{"name":"纸间"}\n```')
      })
      .use(commonmark)
      .use(gfm)
      .use($prose(() => structuredCodePlugin))
    await editor.create()
    const view = editor.action((ctx) => ctx.get(editorViewCtx))
    const button = root.querySelector<HTMLButtonElement>('.structured-code-btn')
    expect(button?.textContent).toBe('格式化')
    button?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(view.state.doc.textContent).toContain('"name": "纸间"')
    await editor.destroy()
    root.remove()
  })
})
