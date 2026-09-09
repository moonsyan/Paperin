import katex from 'katex'
import type { KatexOptions } from 'katex'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView, NodeView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import type { Ctx } from '@milkdown/ctx'
import { katexOptionsCtx } from '@milkdown/plugin-math'
import { isImeComposing } from '../../../lib/keyboard'

/**
 * 可编辑数学公式 NodeView。
 *
 * `@milkdown/plugin-math` 把 math_inline / math_block 渲染为 `atom: true` 的
 * KaTeX 节点，渲染后光标无法进入节点内部，导致公式“写完一次就再也不能改”。
 * 这里用 ProseMirror NodeView 接管渲染：展示态渲染 KaTeX，双击（空白公式单击）
 * 切换到可编辑 textarea；失焦 / Enter 提交并写回节点，Esc 取消。
 */

const MATH_EDITABLE_KEY = new PluginKey('math-editable')

export const setMathNodeEditingState = (
  wrapper: HTMLElement,
  display: HTMLElement,
  edit: HTMLTextAreaElement,
  isEditing: boolean,
): void => {
  wrapper.classList.toggle('is-editing', isEditing)
  display.hidden = isEditing
  edit.hidden = !isEditing
}

class MathNodeView implements NodeView {
  dom: HTMLElement
  private readonly view: EditorView
  private readonly getPos: () => number | undefined
  private readonly isBlock: boolean
  private readonly katexOptions: KatexOptions
  private node: ProseNode
  private isEditing = false
  private readonly displayEl: HTMLElement
  private readonly editEl: HTMLTextAreaElement

  constructor(
    node: ProseNode,
    view: EditorView,
    getPos: () => number | undefined,
    katexOptions: KatexOptions,
  ) {
    this.node = node
    this.view = view
    this.getPos = getPos
    this.katexOptions = katexOptions
    this.isBlock = node.type.name === 'math_block'

    const wrapper = document.createElement(this.isBlock ? 'div' : 'span')
    wrapper.className = `math-node ${this.isBlock ? 'math-block' : 'math-inline'}`
    wrapper.contentEditable = 'false'

    const display = document.createElement(this.isBlock ? 'div' : 'span')
    display.className = 'math-display'
    display.title = '双击编辑公式'
    display.addEventListener('dblclick', this.handleDisplayDblClick)
    display.addEventListener('click', this.handleDisplayClick)

    const edit = document.createElement('textarea')
    edit.className = 'math-edit'
    edit.rows = this.isBlock ? 4 : 1
    edit.spellcheck = false
    edit.hidden = true
    edit.setAttribute('aria-label', this.isBlock ? '编辑块级数学公式' : '编辑行内数学公式')
    edit.addEventListener('blur', this.handleEditBlur)
    edit.addEventListener('keydown', this.handleEditKeyDown)

    wrapper.append(display, edit)
    this.dom = wrapper
    this.displayEl = display
    this.editEl = edit
    this.renderDisplay()
  }

  private getSource(): string {
    if (this.isBlock) return (this.node.attrs.value as string) ?? this.node.textContent
    return this.node.textContent
  }

  private renderDisplay(): void {
    const source = this.getSource()
    this.dom.classList.toggle('math-empty', source.length === 0)
    this.displayEl.replaceChildren()
    if (source.length === 0) return
    try {
      katex.render(source, this.displayEl, {
        ...this.katexOptions,
        displayMode: this.isBlock,
      })
    } catch {
      const err = document.createElement('span')
      err.className = 'math-error'
      err.textContent = source
      this.displayEl.append(err)
    }
  }

  private handleDisplayDblClick = (): void => {
    this.enterEditMode()
  }

  private handleDisplayClick = (): void => {
    // 空白公式：单击即可开始编辑，避免“空的原子节点永远进不去”的死局
    if (this.getSource().length === 0 && !this.isEditing) this.enterEditMode()
  }

  private enterEditMode(): void {
    if (this.isEditing) return
    this.isEditing = true
    this.editEl.value = this.getSource()
    setMathNodeEditingState(this.dom, this.displayEl, this.editEl, true)
    this.editEl.focus()
    this.editEl.select()
  }

  private exitEditMode(): void {
    this.isEditing = false
    setMathNodeEditingState(this.dom, this.displayEl, this.editEl, false)
  }

  private commit(): void {
    if (!this.isEditing) return
    const pos = this.getPos()
    if (typeof pos !== 'number') {
      this.exitEditMode()
      this.renderDisplay()
      return
    }
    const current = this.view.state.doc.nodeAt(pos)
    if (!current || current.type !== this.node.type) {
      this.exitEditMode()
      this.renderDisplay()
      return
    }
    const value = this.editEl.value
    const schema = this.view.state.schema
    // 行内公式清空则删除该原子节点，避免残留一个不可见、无法再编辑的占位
    if (!this.isBlock && value.trim().length === 0) {
      this.exitEditMode()
      this.view.dispatch(this.view.state.tr.delete(pos, pos + current.nodeSize))
      return
    }
    const content = value.length > 0 ? schema.text(value) : undefined
    const newNode = this.isBlock
      ? schema.node('math_block', { value }, content)
      : schema.node('math_inline', {}, content)
    this.node = newNode
    this.exitEditMode()
    this.renderDisplay()
    const tr = this.view.state.tr.replaceWith(pos, pos + current.nodeSize, newNode)
    // 选区必须基于替换后的事务文档创建：用旧文档（state.doc）坐标构造的
    // TextSelection 会让 setSelection 抛 RangeError，整个提交事务不执行，
    // 用户在公式编辑框里的修改被静默丢弃。near() 兼容块级公式提交后
    // 落点位于块边界（非 inlineContent）的场景。
    const after = Math.min(pos + newNode.nodeSize, tr.doc.content.size)
    tr.setSelection(TextSelection.near(tr.doc.resolve(after)))
    tr.scrollIntoView()
    this.view.dispatch(tr)
    this.view.focus()
  }

  private cancel(): void {
    if (!this.isEditing) return
    this.exitEditMode()
    this.renderDisplay()
    const pos = this.getPos()
    if (typeof pos === 'number') {
      this.view.dispatch(
        this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, pos)),
      )
    }
    this.view.focus()
  }

  private handleEditBlur = (): void => {
    this.commit()
  }

  private handleEditKeyDown = (event: KeyboardEvent): void => {
    // IME 组合期间（候选窗打开）的 Esc/Enter 是输入法操作，不能当作提交/取消
    if (isImeComposing(event)) return
    if (event.key === 'Escape') {
      event.preventDefault()
      this.cancel()
      return
    }
    if (this.isBlock) {
      // 块级公式内 Enter 换行（多行公式），Ctrl/Cmd+Enter 提交
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        this.commit()
      }
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      this.commit()
    }
  }

  update: (node: ProseNode) => boolean = (node) => {
    if (node.type !== this.node.type) return false
    const oldSource = this.getSource()
    this.node = node
    const newSource = this.getSource()
    if (this.isEditing) {
      // 外部事务（撤销/重做等）改动了公式内容，同步到编辑框
      this.editEl.value = newSource
    } else if (oldSource !== newSource) {
      this.renderDisplay()
    }
    return true
  }

  stopEvent: (event: Event) => boolean = (event) => {
    const target = event.target as Node | null
    if (!target || !this.dom.contains(target)) return false
    if (this.isEditing) return true
    if (event.type === 'dblclick') return true
    return false
  }

  ignoreMutation: () => boolean = () => true

  destroy: () => void = () => {
    this.displayEl.removeEventListener('dblclick', this.handleDisplayDblClick)
    this.displayEl.removeEventListener('click', this.handleDisplayClick)
    this.editEl.removeEventListener('blur', this.handleEditBlur)
    this.editEl.removeEventListener('keydown', this.handleEditKeyDown)
  }
}

export const mathEditablePlugin = $prose((ctx: Ctx) => {
  const userKatexOptions = ctx.get(katexOptionsCtx.key) as KatexOptions
  const katexOptions: KatexOptions = {
    ...userKatexOptions,
    // 渲染失败不应抛错中断 NodeView；改为展示原始公式文本（.math-error 样式）
    throwOnError: false,
  }
  const createView = (node: ProseNode, view: EditorView, getPos: () => number | undefined) =>
    new MathNodeView(node, view, getPos, katexOptions)
  return new Plugin({
    key: MATH_EDITABLE_KEY,
    props: {
      nodeViews: {
        math_inline: createView,
        math_block: createView,
      },
    },
  })
})
