import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorState } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import { streamInsertKey } from '../viewport/editorViewport'

/* ==================== 块级上下文标记（光标所在块高亮，对标 Typora） ==================== */

const blockContextKey = new PluginKey('block-context')

/** 找到包含光标的顶层块，给它加一个高亮 class。
 * 3.1：用 doc.resolve 直接定位光标所在顶层块（O(深度)），取代原先 doc.forEach
 * 全篇遍历（O(文档)）——大文档每次事务/分块流式插入都不再扫全篇。 */
function buildBlockContextDecos(state: EditorState): DecorationSet {
  const doc = state.doc
  const from = state.selection.from
  try {
    const $from = doc.resolve(Math.min(from, doc.content.size))
    const node = $from.node(1)
    const foundStart = $from.before(1)
    const foundEnd = foundStart + node.nodeSize
    return DecorationSet.create(doc, [
      Decoration.node(foundStart, foundEnd, { class: 'block-active' }),
    ])
  } catch {
    return DecorationSet.empty
  }
}

export const blockContextPlugin = new Plugin({
  key: blockContextKey,
  state: {
    init: (_c, state) => buildBlockContextDecos(state),
    apply(tr, prev, _old, newState) {
      // 3.1 Tier 2：分块流式插入的事务标记——直接映射，避免每次插入都重建
      if (tr.getMeta(streamInsertKey)) {
        return (prev as DecorationSet).map(tr.mapping, tr.doc)
      }
      if (tr.docChanged || tr.selectionSet) return buildBlockContextDecos(newState)
      return prev
    },
  },
  props: {
    decorations(state) {
      return blockContextKey.getState(state) as DecorationSet
    },
  },
})
