import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorState, Transaction } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { visit } from 'unist-util-visit'

import { normalizeCodeLanguage } from '../../../lib/code-language'

export const normalizeCodeLanguageKey = new PluginKey('normalize-code-language')

/** remark：解析阶段就把围栏 lang 归一化，避免 Prism 首帧 includes 失败告警。 */
export function remarkNormalizeCodeLanguage() {
  return (tree: unknown) => {
    visit(tree as never, 'code', (node: { lang?: string | null }) => {
      if (typeof node.lang !== 'string') return
      node.lang = normalizeCodeLanguage(node.lang)
    })
  }
}

const buildNormalizeTransaction = (state: EditorState): Transaction | null => {
  let transaction: Transaction | null = null
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return
    const current = typeof node.attrs.language === 'string' ? node.attrs.language : ''
    const normalized = normalizeCodeLanguage(current)
    if (normalized === current) return
    if (!transaction) transaction = state.tr
    transaction.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      language: normalized,
    })
  })
  return transaction
}

/**
 * 把所有 code_block 的 language 归一化为 refractor 可匹配的小写/别名。
 * Milkdown Prism 用 listLanguages().includes(language) 且区分大小写；
 * 围栏 ```JSON、粘贴、旧文档等路径若不归一化会整块跳过装饰，表现为「完全没有高亮」。
 *
 * 初始 EditorState 不会走 appendTransaction，故在 view 挂载后再补一次。
 */
export const normalizeCodeLanguagePlugin = new Plugin({
  key: normalizeCodeLanguageKey,
  appendTransaction(_transactions, _oldState, newState): Transaction | null {
    return buildNormalizeTransaction(newState)
  },
  view(editorView: EditorView) {
    queueMicrotask(() => {
      if (editorView.isDestroyed) return
      const transaction = buildNormalizeTransaction(editorView.state)
      if (transaction) editorView.dispatch(transaction)
    })
    return {}
  },
})
