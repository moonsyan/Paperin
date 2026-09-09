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
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import {
  isMermaidLanguage,
  isSelectionInsideMermaidBlock,
  shouldRemoveMermaidSource,
  mermaidPreviewPlugin,
} from './mermaidCodeBlock'

describe('isMermaidLanguage', () => {
  it('识别大小写与空白不同的 Mermaid 代码块语言', () => {
    expect(isMermaidLanguage('mermaid')).toBe(true)
    expect(isMermaidLanguage(' Mermaid ')).toBe(true)
    expect(isMermaidLanguage('MERMAID')).toBe(true)
  })

  it('不把其他代码块语言当作 Mermaid', () => {
    expect(isMermaidLanguage('markdown')).toBe(false)
    expect(isMermaidLanguage(undefined)).toBe(false)
  })

  it('仅在选区离开 Mermaid 代码块后恢复图表模式', () => {
    expect(isSelectionInsideMermaidBlock(11, 11, 10, 20)).toBe(true)
    expect(isSelectionInsideMermaidBlock(10, 10, 10, 20)).toBe(false)
    expect(isSelectionInsideMermaidBlock(11, 31, 10, 20)).toBe(false)
  })

  it('视口外没有预览组件时保留 Mermaid 源码', () => {
    expect(shouldRemoveMermaidSource(false, false, false)).toBe(false)
    expect(shouldRemoveMermaidSource(true, true, true)).toBe(false)
    expect(shouldRemoveMermaidSource(true, false, false)).toBe(false)
    expect(shouldRemoveMermaidSource(true, false, true)).toBe(true)
  })
})

describe('Mermaid 预览渲染触发', () => {
  const buildEditor = async (
    md: string,
  ): Promise<{ view: EditorView; root: HTMLElement; scrollEl: HTMLElement }> => {
    const scrollEl = document.createElement('div')
    scrollEl.className = 'editor-scroll'
    const root = document.createElement('div')
    scrollEl.appendChild(root)
    document.body.appendChild(scrollEl)
    const editor = MilkdownCore.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, md)
      })
      .use(commonmark)
      .use(gfm)
      .use($prose(() => mermaidPreviewPlugin))
    await editor.create()
    const view = editor.action((ctx) => ctx.get(editorViewCtx))
    return { view, root, scrollEl }
  }

  it('widget 创建后状态文案立即为"正在渲染"（不再依赖 IO 门控）', async () => {
    const { root } = await buildEditor('```mermaid\ngraph TD\n  A --> B\n```')
    const widget = root.querySelector('.mermaid-block')
    expect(widget).toBeTruthy()
    const status = root.querySelector('.mermaid-status')
    // C-7：去掉 IO 视口门控后，构造期就会调用 renderNow，
    // 状态文案应当立刻切换为"正在渲染图表…"，而不是停留在"进入视口"占位文案。
    expect(status?.textContent).toBe('正在渲染图表…')
  })

  it('无 mermaid 代码块时不创建预览组件', async () => {
    const { root } = await buildEditor('# 纯文本\n\n普通段落。')
    expect(root.querySelector('.mermaid-block')).toBeNull()
  })
})
