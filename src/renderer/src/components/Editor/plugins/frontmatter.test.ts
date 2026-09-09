// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  Editor as MilkdownCore,
  defaultValueCtx,
  editorViewCtx,
  remarkPluginsCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { getMarkdown } from '@milkdown/kit/utils'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Editor } from '@milkdown/kit/core'
import { TextSelection } from '@milkdown/kit/prose/state'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import {
  frontmatterKeymap,
  frontmatterRemarkPlugin,
  frontmatterSchema,
} from './frontmatter'

/** 与 useMilkdownInstance 相同的 frontmatter 相关插件栈
 *  （keymap 须先于 commonmark 注册才能抢先其 Enter 绑定） */
const buildDoc = async (
  md: string,
): Promise<{ view: EditorView; out: string; root: HTMLElement; editor: Editor }> => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = MilkdownCore.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
      ctx
        .get(remarkPluginsCtx)
        .push({ plugin: frontmatterRemarkPlugin, options: {} } as never)
    })
    .use(frontmatterKeymap)
    .use(commonmark)
    .use(frontmatterSchema)
  await editor.create()
  const view = editor.action((ctx) => ctx.get(editorViewCtx))
  const out = editor.action(getMarkdown())
  return { view, out, root, editor }
}

const nodeNames = (view: EditorView): string[] => {
  const names: string[] = []
  view.state.doc.descendants((node) => {
    names.push(node.type.name)
  })
  return names
}

/** 把光标放到指定位置后模拟 Enter 键（经 handleKeyDown 走 keymap） */
const pressEnterAt = (view: EditorView, pos: number): boolean => {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
  const handled = view.someProp('handleKeyDown', (f) =>
    f(view, new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  )
  return handled ?? false
}

describe('frontmatter：解析与往返', () => {
  it('正常 YAML 头部解析为 frontmatter 节点且往返一致', async () => {
    const md = ['---', 'title: 笔记', 'tags: [a, b]', '---', '', '正文内容。'].join('\n')
    const { view, out } = await buildDoc(md)
    expect(nodeNames(view)[0]).toBe('frontmatter')
    expect(out).toContain('title: 笔记')
    expect(out).toContain('tags: [a, b]')
    expect(out).toContain('正文内容。')
  })

  it('中文值与中文键名往返不丢失', async () => {
    const md = ['---', '标题: 深度学习笔记', '作者: 张三', '---', '', '# 第一章'].join('\n')
    const { view, out } = await buildDoc(md)
    expect(nodeNames(view)[0]).toBe('frontmatter')
    expect(out).toContain('标题: 深度学习笔记')
    expect(out).toContain('作者: 张三')
    expect(out).toContain('# 第一章')
  })

  it('CRLF 文档加载后序列化不丢内容', async () => {
    const md = '---\r\ntitle: CRLF\r\n---\r\n\r\n正文。\r\n'
    const { view, out } = await buildDoc(md)
    expect(nodeNames(view)[0]).toBe('frontmatter')
    expect(out).toContain('title: CRLF')
    expect(out).toContain('正文。')
  })
})

describe('frontmatter：异常与不完整输入', () => {
  it('仅开头 --- 无闭合围栏时按普通段落/主题分隔保留文本', async () => {
    const md = ['---', 'title: 未闭合', '', '正文。'].join('\n')
    const { out } = await buildDoc(md)
    expect(out).toContain('title: 未闭合')
    expect(out).toContain('正文。')
  })

  it('frontmatter 后无空行直接接正文时不丢正文', async () => {
    const md = ['---', 'title: 紧凑', '---', '正文紧跟围栏。'].join('\n')
    const { view, out } = await buildDoc(md)
    expect(nodeNames(view)).toContain('frontmatter')
    expect(out).toContain('title: 紧凑')
    expect(out).toContain('正文紧跟围栏。')
  })

  it('空属性行与注释行往返保留', async () => {
    const md = ['---', '# 注释行', 'key:', '---', '', '正文。'].join('\n')
    const { out } = await buildDoc(md)
    expect(out).toContain('# 注释行')
    expect(out).toContain('key:')
    expect(out).toContain('正文。')
  })
})

describe('frontmatter：编辑行为', () => {
  it('DOM 渲染为可编辑 pre 区域', async () => {
    const md = ['---', 'title: dom', '---', '', '正文。'].join('\n')
    const { root } = await buildDoc(md)
    const block = root.querySelector('.frontmatter-block')
    expect(block).not.toBeNull()
    expect(block?.querySelector('pre')).not.toBeNull()
  })

  it('frontmatter 内插入换行不拆分节点（避免产生两段围栏）', async () => {
    const md = ['---', 'title: 编辑测试', '---', '', '正文。'].join('\n')
    const { view, editor } = await buildDoc(md)
    // 光标放到 frontmatter 文本中间（文档首块内，"title: 编辑|测试" 处）
    const handled = pressEnterAt(view, 1 + 8)
    expect(handled).toBe(true)
    // 节点未被拆分：文档仍只有一个 frontmatter 块，换行在节点内部
    const fmCount = nodeNames(view).filter((n) => n === 'frontmatter').length
    expect(fmCount).toBe(1)
    const out = editor.action(getMarkdown())
    // 序列化仍只有一对 --- 围栏，换行保留在 YAML 文本内
    expect((out.match(/---/g) ?? []).length).toBe(2)
    expect(out).toContain('title: 编\n辑测试')
  })
})
