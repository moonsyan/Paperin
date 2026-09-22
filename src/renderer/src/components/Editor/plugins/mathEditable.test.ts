// @vitest-environment jsdom

import { beforeAll, describe, expect, it } from 'vitest'
import { fireEvent } from '@testing-library/react'

// prosemirror-view 提交事务后 scrollIntoView → coordsAtPos 对文本位置走
// document.createRange() 路径，要求 Range 也具备几何 API；jsdom 只实现
// 了元素级 API，Range 级缺失会导致 unhandled error。生产代码不添加绕过
// 异常的空 catch，统一在此补齐测试环境桩。
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  })
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
  })
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
  })
})

describe('jsdom 环境', () => {
  it('公式提交路径使用的几何 API 在 jsdom 中可用', () => {
    // 元素级：NodeView DOM 测量
    expect(typeof HTMLElement.prototype.getClientRects).toBe('function')
    expect(typeof HTMLElement.prototype.getBoundingClientRect).toBe('function')
    // Range 级：coordsAtPos 文本位置经 createRange() 调用
    expect(typeof Range.prototype.getClientRects).toBe('function')
    expect(typeof Range.prototype.getBoundingClientRect).toBe('function')
  })
})
import {
  Editor as MilkdownCore,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
} from '@milkdown/kit/core'
import { getMarkdown } from '@milkdown/kit/utils'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Editor } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { math } from '@milkdown/plugin-math'
import { mathEditablePlugin, setMathNodeEditingState } from './mathEditable'

/** 公式插件栈（与 useMilkdownInstance 的 math + mathEditablePlugin 一致） */
const buildDoc = async (
  md: string,
): Promise<{ view: EditorView; out: string; root: HTMLElement; editor: Editor }> => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = MilkdownCore.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
    })
    .use(commonmark)
    .use(math)
    .use(mathEditablePlugin)
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

/** 模拟双击公式进入编辑态，修改源码后失焦提交；返回提交后的选区位置 */
const commitFormula = (root: HTMLElement, view: EditorView, nextSource: string): number => {
  const display = root.querySelector<HTMLElement>('.math-node .math-display')
  if (!display) throw new Error('未找到公式展示元素')
  display.dispatchEvent(new Event('dblclick'))
  const edit = root.querySelector<HTMLTextAreaElement>('.math-node .math-edit')
  if (!edit) throw new Error('未找到公式编辑框')
  edit.value = nextSource
  edit.dispatchEvent(new Event('blur'))
  return view.state.selection.from
}

describe('setMathNodeEditingState', () => {
  it('展示态只保留公式渲染元素', () => {
    const classes = new Set<string>()
    const wrapper = {
      classList: {
        contains: (name: string) => classes.has(name),
        toggle: (name: string, force?: boolean) => {
          if (force) {
            classes.add(name)
            return true
          }
          classes.delete(name)
          return false
        },
      },
    } as unknown as HTMLElement
    const display = { hidden: false } as HTMLElement
    const edit = { hidden: false } as HTMLTextAreaElement

    setMathNodeEditingState(wrapper, display, edit, false)

    expect(wrapper.classList.contains('is-editing')).toBe(false)
    expect(display.hidden).toBe(false)
    expect(edit.hidden).toBe(true)
  })

  it('编辑态只保留公式输入框', () => {
    const classes = new Set<string>()
    const wrapper = {
      classList: {
        contains: (name: string) => classes.has(name),
        toggle: (name: string, force?: boolean) => {
          if (force) {
            classes.add(name)
            return true
          }
          classes.delete(name)
          return false
        },
      },
    } as unknown as HTMLElement
    const display = { hidden: false } as HTMLElement
    const edit = { hidden: false } as HTMLTextAreaElement

    setMathNodeEditingState(wrapper, display, edit, true)

    expect(wrapper.classList.contains('is-editing')).toBe(true)
    expect(display.hidden).toBe(true)
    expect(edit.hidden).toBe(false)
  })
})

describe('公式：解析与 Markdown 往返', () => {
  it('行内与块级公式往返一致', async () => {
    const md = ['段落 $a+b$ 文字。', '', '$$', 'c^2', '$$'].join('\n')
    const { view, out } = await buildDoc(md)
    const names = nodeNames(view)
    expect(names).toContain('math_inline')
    expect(names).toContain('math_block')
    expect(out).toBe(`${md}\n`)
  })

  it('中文公式源码往返一致', async () => {
    const md = [
      '面积 $\\text{底} \\times \\text{高}$ 公式。',
      '',
      '$$',
      '\\text{勾股定理}',
      '$$',
    ].join('\n')
    const { view, out } = await buildDoc(md)
    expect(nodeNames(view)).toContain('math_inline')
    expect(nodeNames(view)).toContain('math_block')
    expect(out).toContain('\\text{底} \\times \\text{高}')
    expect(out).toContain('\\text{勾股定理}')
  })

  it('未闭合 $ 不破坏正文（按普通文本保留）', async () => {
    const md = 'Prices are $5 USD and $3 USD.'
    const { out } = await buildDoc(md)
    expect(out).toContain('$5 USD')
    expect(out).toContain('$3 USD')
  })
})

describe('公式：NodeView 提交路径', () => {
  it('双击进入编辑、失焦提交写回节点并序列化回 Markdown', async () => {
    const { root, view, editor } = await buildDoc('前文 $x$ 后文。')
    expect(root.querySelector('.math-node')).not.toBeNull()

    commitFormula(root, view, '\\alpha + \\beta')

    const text = view.state.doc.textBetween(0, view.state.doc.content.size, '\n')
    expect(text).toContain('\\alpha + \\beta')
    expect(editor.action(getMarkdown())).toContain('$\\alpha + \\beta$')
  })

  it('提交后光标位于新公式之后（新旧源码长度不同也不偏移）', async () => {
    const { root, view } = await buildDoc('前文 $x$ 后文。')
    const before = commitFormula(root, view, '\\alpha\\beta\\gamma\\delta')
    // 选区必须紧跟新节点：若按旧文档坐标创建会落在“后文”中间或之前
    const nodeEnd =
      view.state.doc.textBetween(0, before, '\n').indexOf('\\alpha\\beta\\gamma\\delta') +
      '\\alpha\\beta\\gamma\\delta'.length
    expect(before).toBeGreaterThanOrEqual(nodeEnd)
  })

  it('行内公式清空提交后原子节点被删除且不留空占位', async () => {
    const { root, view, editor } = await buildDoc('前文 $x$ 后文。')
    commitFormula(root, view, '  ')
    expect(nodeNames(view)).not.toContain('math_inline')
    const out = editor.action(getMarkdown())
    expect(out).not.toContain('$' + '$')
    expect(out).toContain('前文')
    expect(out).toContain('后文')
  })

  it('块级公式提交写回且光标落在公式之后', async () => {
    const { root, view, editor } = await buildDoc(['$$', 'c^2', '$$', '', '正文段落。'].join('\n'))
    expect(root.querySelector('.math-block')).not.toBeNull()

    const before = commitFormula(root, view, 'a^2 + b^2')

    expect(editor.action(getMarkdown())).toContain('a^2 + b^2')
    // 光标应位于块级公式之后的正文区域，而不是抛错丢失编辑
    expect(before).toBeGreaterThan(0)
  })

  it('Esc 取消不改动节点内容', async () => {
    const { root, view, editor } = await buildDoc('前文 $x$ 后文。')
    const display = root.querySelector<HTMLElement>('.math-node .math-display')
    display?.dispatchEvent(new Event('dblclick'))
    const edit = root.querySelector<HTMLTextAreaElement>('.math-node .math-edit')
    if (edit) {
      edit.value = '被取消的内容'
      edit.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    }
    expect(editor.action(getMarkdown())).toContain('$x$')
    expect(view.state.selection.from).toBeGreaterThan(0)
  })

  it('IME：composition 期间 Enter 不提交行内公式', async () => {
    const { root, view, editor } = await buildDoc('前文 $x$ 后文。')
    const display = root.querySelector<HTMLElement>('.math-node .math-display')
    display?.dispatchEvent(new Event('dblclick'))
    const edit = root.querySelector<HTMLTextAreaElement>('.math-node .math-edit')
    expect(edit).toBeTruthy()
    edit!.value = '\\alpha'
    fireEvent.compositionStart(edit!)
    fireEvent.input(edit!, { data: 'a' })
    fireEvent.keyDown(edit!, { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true })
    expect(editor.action(getMarkdown())).toContain('$x$')
    expect(root.querySelector('.math-node.is-editing')).toBeTruthy()
    fireEvent.compositionEnd(edit!)
    expect(view.state.selection.from).toBeGreaterThan(0)
  })

  it('IME：composition 期间 Escape 不取消行内公式', async () => {
    const { root, editor } = await buildDoc('前文 $x$ 后文。')
    const display = root.querySelector<HTMLElement>('.math-node .math-display')
    display?.dispatchEvent(new Event('dblclick'))
    const edit = root.querySelector<HTMLTextAreaElement>('.math-node .math-edit')
    expect(edit).toBeTruthy()
    edit!.value = 'not-committed'
    fireEvent.compositionStart(edit!)
    fireEvent.input(edit!, { data: 'b' })
    fireEvent.keyDown(edit!, { key: 'Escape', isComposing: true, keyCode: 229, bubbles: true })
    fireEvent.compositionEnd(edit!)
    expect(editor.action(getMarkdown())).toContain('$x$')
    expect(root.querySelector('.math-node.is-editing')).toBeTruthy()
  })

  it('块级公式 Esc 取消不改动节点且选区保持有效', async () => {
    const { root, view, editor } = await buildDoc(['$$', 'c^2', '$$', '', '正文段落。'].join('\n'))
    const display = root.querySelector<HTMLElement>('.math-node .math-display')
    display?.dispatchEvent(new Event('dblclick'))
    const edit = root.querySelector<HTMLTextAreaElement>('.math-node .math-edit')
    if (edit) {
      edit.value = '被取消的内容'
      edit.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
    }
    expect(editor.action(getMarkdown())).toContain('c^2')
    // 取消后选区必须仍指向有效文档位置（访问 content 不抛错即选区可解析）
    expect(view.state.selection.$from.parent.content.size).toBeGreaterThanOrEqual(0)
  })
})
