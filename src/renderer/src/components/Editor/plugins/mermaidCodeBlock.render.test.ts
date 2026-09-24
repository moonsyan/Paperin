// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  Editor as MilkdownCore,
  defaultValueCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { $prose } from '@milkdown/kit/utils'
import { mermaidPreviewPlugin } from './mermaidCodeBlock'

describe('Mermaid 真实渲染落定', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('简单 flowchart 最终出现 svg 或错误态，不永久停在正在渲染', async () => {
    const scrollEl = document.createElement('div')
    scrollEl.className = 'editor-scroll'
    Object.defineProperty(scrollEl, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 800, left: 0, right: 600, width: 600, height: 800, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const root = document.createElement('div')
    scrollEl.appendChild(root)
    document.body.appendChild(scrollEl)

    const md = ['```mermaid', 'graph TD', '  A[开始] --> B[结束]', '```'].join('\n')
    const editor = MilkdownCore.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, md)
      })
      .use(commonmark)
      .use(gfm)
      .use($prose(() => mermaidPreviewPlugin))
    await editor.create()

    expect(root.querySelector('.mermaid-block')).toBeTruthy()

    const deadline = Date.now() + 20000
    let status = ''
    let hasSvg = false
    while (Date.now() < deadline) {
      hasSvg = Boolean(root.querySelector('.mermaid-preview svg'))
      status = root.querySelector('.mermaid-status')?.textContent ?? ''
      if (hasSvg || (status && status !== '正在渲染图表…')) break
      await new Promise((r) => setTimeout(r, 100))
    }
    // eslint-disable-next-line no-console
    console.log('result', { hasSvg, status })
    expect(hasSvg || (status.length > 0 && status !== '正在渲染图表…')).toBe(true)
  }, 25000)
})
