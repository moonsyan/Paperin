// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  Editor as MilkdownCore,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import type { EditorView } from '@milkdown/kit/prose/view'
import { taskListCheckboxPlugin } from './taskListCheckbox'
import { linkClickPlugin } from './linkClick'

const buildDoc = async (md: string): Promise<{ view: EditorView; root: HTMLElement }> => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = MilkdownCore.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
    })
    .use(commonmark)
    .use(gfm)
    .use(taskListCheckboxPlugin)
    .use(linkClickPlugin)
  await editor.create()
  const view = editor.action((ctx) => ctx.get(editorViewCtx))
  return { view, root }
}

/** 点击后读取第一个任务项的 checked 属性 */
const firstTaskChecked = (view: EditorView): boolean | null => {
  let checked: boolean | null = null
  view.state.doc.descendants((node) => {
    if (node.type.name === 'list_item' && checked === null) {
      checked = node.attrs.checked ?? null
    }
  })
  return checked
}

const fakeEvent = (target: Element | null, extra: Partial<MouseEvent> = {}) =>
  ({ target, preventDefault: () => {}, ...extra }) as unknown as MouseEvent

describe('任务列表复选框点击', () => {
  const md = ['- [x] 已完成项', '- [ ] 未完成项'].join('\n')

  it('点击复选框区域（li 自身 + 左上区域）切换勾选', async () => {
    const { view, root } = await buildDoc(md)
    expect(firstTaskChecked(view)).toBe(true)
    let li = root.querySelector("li[data-item-type='task']")
    expect(li).toBeTruthy()
    // jsdom getBoundingClientRect 全 0：clientX/Y 相对 0 即落在左上复选框区
    view.someProp('handleClick', (h) => h(view, 1, fakeEvent(li, { clientX: 10, clientY: 5 })))
    expect(firstTaskChecked(view)).toBe(false)
    // dispatch 后 PM 重新渲染替换了 li，须重新查询
    li = root.querySelector("li[data-item-type='task']")
    view.someProp('handleClick', (h) => h(view, 1, fakeEvent(li, { clientX: 10, clientY: 5 })))
    expect(firstTaskChecked(view)).toBe(true)
  })

  it('点击复选框区域之外的 li 自身区域不切换', async () => {
    const { view, root } = await buildDoc(md)
    const li = root.querySelector("li[data-item-type='task']")
    // 点击 li 右下角（超出复选框区域）
    view.someProp('handleClick', (h) => h(view, 1, fakeEvent(li, { clientX: 200, clientY: 50 })))
    expect(firstTaskChecked(view)).toBe(true)
  })

  it('点击普通列表项文本不触发', async () => {
    const { view, root } = await buildDoc(md)
    const li = root.querySelector("li[data-item-type='task']")
    // target 为 li 的子元素（段落文本）时不处理
    const p = li?.querySelector('p') ?? null
    view.someProp('handleClick', (h) => h(view, 1, fakeEvent(p, { clientX: 5, clientY: 5 })))
    expect(firstTaskChecked(view)).toBe(true)
  })
})

describe('链接 Ctrl+点击打开', () => {
  it('Ctrl+点击 http 链接调用 window.open', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { view, root } = await buildDoc('访问 [官网](https://example.com) 了解。')
    const anchor = root.querySelector('a')
    expect(anchor).toBeTruthy()
    view.someProp('handleClick', (h) =>
      h(view, 1, fakeEvent(anchor, { clientX: 5, clientY: 5, ctrlKey: true })),
    )
    expect(openSpy).toHaveBeenCalledWith('https://example.com')
    openSpy.mockRestore()
  })

  it('Ctrl+点击自动链接同样打开', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { view, root } = await buildDoc('网址 https://github.com 更多')
    const anchor = root.querySelector('a')
    expect(anchor).toBeTruthy()
    view.someProp('handleClick', (h) =>
      h(view, 1, fakeEvent(anchor, { clientX: 5, clientY: 5, ctrlKey: true })),
    )
    expect(openSpy).toHaveBeenCalledWith('https://github.com')
    openSpy.mockRestore()
  })

  it('普通单击不打开（保持编辑行为）', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { view, root } = await buildDoc('访问 [官网](https://example.com) 了解。')
    const anchor = root.querySelector('a')
    view.someProp('handleClick', (h) =>
      h(view, 1, fakeEvent(anchor, { clientX: 5, clientY: 5 })),
    )
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('非安全协议（javascript:）不打开', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { view, root } = await buildDoc('访问 [危险](javascript:alert(1)) 了解。')
    const anchor = root.querySelector('a')
    // 构造 href 属性（jsdom 中编辑器 a 标签可能已带 href）
    anchor?.setAttribute('href', 'javascript:alert(1)')
    view.someProp('handleClick', (h) =>
      h(view, 1, fakeEvent(anchor, { clientX: 5, clientY: 5, ctrlKey: true })),
    )
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })
})
