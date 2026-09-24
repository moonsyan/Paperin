// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  Editor as MilkdownCore,
  defaultValueCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { $prose } from '@milkdown/kit/utils'
import mermaid from 'mermaid'
import { mermaidPreviewPlugin } from './mermaidCodeBlock'
import {
  isMermaidErrorSvg,
  mermaidThemeOptions,
  sanitizeMermaidSource,
  sanitizeMermaidSvg,
} from './mermaid-source'

const USER_DIAGRAM = `graph TD
    A["LiveAiTask / VideoShopTask"] -->|"创建/更新 image_path + status=0"| B["t_live_image_processing 表"]
    B -->|"查询 status=0 的记录"| C["LiveImageProcessingTask.markProcessing()"]
    C -->|"标记 status=3 (MARKED)"| D["LiveImageProcessingTask.doTask()"]
    D -->|"读取 image_path 获取 stuPath/teaPath"| E["下载截图到本地"]
    E -->|"学生画面: 人数清点+行为分析"| F["studentScreen()"]
    E -->|"教师画面: 表情分析"| G["teacherScreen()"]
    F --> H["AI识别完成"]
    G --> H
    H -->|"更新 status=2 (SUCCESS)"| I["liveImageProcessingDAO.update()"]
`

beforeAll(() => {
  // jsdom 缺 SVG 量测 API，Mermaid dagre / 边标签会直接炸掉
  const patch = (proto: { getBBox?: () => DOMRect; getComputedTextLength?: () => number } | undefined) => {
    if (!proto) return
    if (typeof proto.getBBox !== 'function') {
      proto.getBBox = () => ({
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        top: 0,
        left: 0,
        bottom: 40,
        right: 120,
        toJSON: () => ({}),
      }) as DOMRect
    }
    if (typeof proto.getComputedTextLength !== 'function') {
      proto.getComputedTextLength = () => 80
    }
  }
  for (const name of ['SVGTextContentElement', 'SVGTextElement', 'SVGGraphicsElement', 'SVGElement'] as const) {
    const ctor = (globalThis as unknown as Record<string, { prototype?: object } | undefined>)[name]
    patch(ctor?.prototype as { getBBox?: () => DOMRect; getComputedTextLength?: () => number } | undefined)
  }
})

describe('用户直播分析 Mermaid 图', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('sanitize 不破坏源码', () => {
    const prepared = sanitizeMermaidSource(USER_DIAGRAM)
    expect(prepared).toContain('LiveAiTask / VideoShopTask')
    expect(prepared).toContain('markProcessing()')
    expect(prepared.startsWith('graph TD')).toBe(true)
  })

  it('mermaidAPI.render 在补齐 getBBox 后能出 SVG', async () => {
    const prepared = sanitizeMermaidSource(USER_DIAGRAM)
    mermaid.initialize(mermaidThemeOptions('default'))
    const result = await mermaid.mermaidAPI.render('user-live', prepared)
    expect(isMermaidErrorSvg(result.svg)).toBe(false)
    expect(sanitizeMermaidSvg(result.svg)).not.toBeNull()
  }, 15_000)

  it('编辑器预览最终离开「正在渲染」', async () => {
    const scrollEl = document.createElement('div')
    scrollEl.className = 'editor-scroll'
    Object.defineProperty(scrollEl, 'getBoundingClientRect', {
      value: () => ({
        top: 0,
        bottom: 800,
        left: 0,
        right: 600,
        width: 600,
        height: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    const root = document.createElement('div')
    scrollEl.appendChild(root)
    document.body.appendChild(scrollEl)

    const md = ['```mermaid', USER_DIAGRAM, '```'].join('\n')
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

    const deadline = Date.now() + 15_000
    let status = ''
    let hasSvg = false
    while (Date.now() < deadline) {
      hasSvg = Boolean(root.querySelector('.mermaid-preview svg'))
      status = root.querySelector('.mermaid-status')?.textContent ?? ''
      if (hasSvg || (status && !/准备渲染|正在加载|正在绘制|正在渲染/.test(status))) break
      await new Promise((r) => setTimeout(r, 100))
    }
    console.log('editor settle', { hasSvg, status })
    expect(hasSvg || (status.length > 0 && !/准备渲染|正在加载|正在绘制|正在渲染/.test(status))).toBe(true)
  }, 20_000)
})
