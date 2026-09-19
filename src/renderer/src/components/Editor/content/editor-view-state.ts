import { TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'

/**
 * 编辑器视图状态：选区 + 滚动位置的存取与聚焦。
 * 标签切换、导出往返等场景需要在替换正文前后原样恢复阅读现场。
 * 不含 React，只依赖 view 与容器 DOM。
 */

export interface EditorViewState {
  selection: { anchor: number; head: number }
  scrollTop: number
}

export const findScrollParent = (container: HTMLElement | null): HTMLElement | null =>
  container?.querySelector<HTMLElement>('.editor-scroll') ?? null

export const focusEditorRoot = (container: HTMLElement | null): void => {
  container?.querySelector<HTMLElement>('.milkdown .editor')?.focus()
}

/** 滚动恢复统一延到下一帧：替换事务引发的布局变化落定后再定位，避免跳动。 */
export const restoreScrollTop = (container: HTMLElement | null, scrollTop: number): void => {
  const scrollParent = findScrollParent(container)
  if (!scrollParent) return
  requestAnimationFrame(() => {
    scrollParent.scrollTop = Math.max(0, scrollTop)
  })
}

export const captureViewState = (
  view: EditorView,
  container: HTMLElement | null,
): EditorViewState => ({
  selection: {
    anchor: view.state.selection.anchor,
    head: view.state.selection.head,
  },
  scrollTop: findScrollParent(container)?.scrollTop ?? 0,
})

export const applyViewState = (
  view: EditorView,
  container: HTMLElement | null,
  state: EditorViewState,
): void => {
  const maxPosition = view.state.doc.content.size
  const anchor = Math.min(maxPosition, Math.max(0, state.selection.anchor))
  const head = Math.min(maxPosition, Math.max(0, state.selection.head))
  try {
    const selection = TextSelection.between(
      view.state.doc.resolve(anchor),
      view.state.doc.resolve(head),
    )
    view.dispatch(view.state.tr.setSelection(selection))
  } catch {
    // 文档结构变化导致位置不可用时保留默认选区。
  }
  view.focus()
  restoreScrollTop(container, state.scrollTop)
}

export const focusDocEnd = (view: EditorView): void => {
  const { state, dispatch } = view
  dispatch(state.tr.setSelection(TextSelection.atEnd(state.doc)).scrollIntoView())
  view.focus()
}

/** 选区落到指定位置并滚动可见；位置不可解析时不动选区。 */
export const focusPosition = (view: EditorView, pos: number): void => {
  const { doc } = view.state
  try {
    view.dispatch(
      view.state.tr.setSelection(TextSelection.near(doc.resolve(pos))).scrollIntoView(),
    )
  } catch {
    return
  }
  view.focus()
}
