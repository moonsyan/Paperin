import { Editor as MilkdownCore, EditorStatus, editorViewCtx } from '@milkdown/kit/core'
import { Selection, TextSelection } from '@milkdown/kit/prose/state'
import {
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
} from 'react'
import { isImeComposing } from '../../lib/keyboard'
import { getNodeExitTargetDirection } from './editor-navigation'

type NavigationDirection = 'up' | 'down'

interface EditorNavigationHandlers {
  exitCodeBlock: (direction: NavigationDirection) => boolean
  enterFrontmatter: () => boolean
}

interface UseEditorNavigationOptions {
  editorRef: MutableRefObject<MilkdownCore | null>
  blankClickToEnd: boolean
}

interface UseEditorNavigationResult {
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  handleBlankClick: (event: MouseEvent<HTMLDivElement>) => void
}

export const handleEditorNavigationKeyDown = (
  event: KeyboardEvent,
  { exitCodeBlock, enterFrontmatter }: EditorNavigationHandlers,
): void => {
  if (isImeComposing(event.nativeEvent)) return
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

  if (event.key === 'ArrowDown') {
    if (exitCodeBlock('down')) event.preventDefault()
    return
  }
  if (event.key !== 'ArrowUp') return
  if (exitCodeBlock('up')) {
    event.preventDefault()
    return
  }
  if (enterFrontmatter()) event.preventDefault()
}

export const useEditorNavigation = ({
  editorRef,
  blankClickToEnd,
}: UseEditorNavigationOptions): UseEditorNavigationResult => {
  const getReadyEditor = (): MilkdownCore | null =>
    editorRef.current?.status === EditorStatus.Created ? editorRef.current : null

  /**
   * 方向键退出代码块（Typora 同款体验）：
   * 光标在代码块最后一行按 ↓ 跳到块后（无块则新建段落），
   * 在第一行按 ↑ 跳到块前。
   */
  const exitCodeBlock = (direction: NavigationDirection): boolean => {
    const editor = getReadyEditor()
    if (!editor) return false
    const view = editor.ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const { $from } = state.selection
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth)
      // frontmatter 与 code_block 同样支持方向键跳出（H5）
      if (node.type.name !== 'code_block' && node.type.name !== 'frontmatter') continue
      const start = $from.before(depth)
      const end = start + node.nodeSize
      const text = node.textContent
      const offset = $from.pos - start - 1

      const targetDirection = getNodeExitTargetDirection(text, direction, offset)
      if (targetDirection === 'after') {
        let target = Selection.findFrom(state.doc.resolve(end), 1)
        let transaction = state.tr
        if (!target) {
          const paragraph = state.schema.nodes.paragraph.create()
          transaction = transaction.insert(end, paragraph)
          target = TextSelection.create(transaction.doc, end + 1)
        }
        dispatch(transaction.setSelection(target).scrollIntoView())
        return true
      }
      if (targetDirection === 'before') {
        let transaction = state.tr
        let target: Selection | null = null
        if (start > 0) {
          target = Selection.findFrom(transaction.doc.resolve(start - 1), -1)
        }
        if (!target) {
          if (node.type.name === 'frontmatter') {
            // frontmatter 必须保持文档首位：不插段落，直接回到文档开头
            dispatch(transaction.setSelection(TextSelection.create(transaction.doc, 0)).scrollIntoView())
            return true
          }
          const paragraph = state.schema.nodes.paragraph.create()
          transaction = transaction.insert(start, paragraph)
          target = TextSelection.create(transaction.doc, start + 1)
        }
        dispatch(transaction.setSelection(target).scrollIntoView())
        return true
      }
      return false
    }
    return false
  }

  /** 从 frontmatter 之后的正文首块按 ↑ 进入 frontmatter 末尾（H5：isolating 挡住反向穿越） */
  const enterFrontmatter = (): boolean => {
    const editor = getReadyEditor()
    if (!editor) return false
    const view = editor.ctx.get(editorViewCtx)
    const { state, dispatch } = view
    const { $from } = state.selection
    if ($from.depth !== 1) return false
    const first = state.doc.child(0)
    if (first.type.name !== 'frontmatter') return false
    // 仅当光标在紧随 frontmatter 的正文首块最前面时触发
    if ($from.pos !== first.nodeSize + 1) return false
    dispatch(
      state.tr
        .setSelection(TextSelection.create(state.doc, first.nodeSize - 1))
        .scrollIntoView(),
    )
    return true
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    handleEditorNavigationKeyDown(event, { exitCodeBlock, enterFrontmatter })
  }

  /** 点击正文最后一个块之后的空白区：光标定位到文末（Typora 同款，可在设置关闭，U8） */
  const handleBlankClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!blankClickToEnd) return
    const editor = getReadyEditor()
    if (!editor) return
    const view = editor.ctx.get(editorViewCtx)
    // 仅当点击位于最后一个顶层块的下边界之外才视为“空白点击”，
    // 避免点击正文内部（如段落间的行距）时误跳文末。
    const contentDom = view.dom as HTMLElement
    const lastBlock = contentDom.lastElementChild as HTMLElement | null
    if (lastBlock && event.clientY <= lastBlock.getBoundingClientRect().bottom) return
    const { state, dispatch } = view
    dispatch(state.tr.setSelection(TextSelection.atEnd(state.doc)).scrollIntoView())
    view.focus()
  }

  return { handleKeyDown, handleBlankClick }
}
