import { schemaCtx } from '@milkdown/kit/core'
import { TextSelection, type EditorState, type Transaction } from '@milkdown/kit/prose/state'
import { InputRule, inputRules } from '@milkdown/kit/prose/inputrules'
import { keymap } from '@milkdown/kit/prose/keymap'
import { $prose } from '@milkdown/kit/utils'
import { normalizeCodeLanguage } from '../../../lib/code-language'

const createCodeBlockSelection = (
  tr: Transaction,
  codeBlockType: NonNullable<EditorState['schema']['nodes']['code_block']>,
  preferredPosition: number,
) => {
  let containingPosition: number | null = null
  let followingPosition: number | null = null
  let precedingPosition: number | null = null

  tr.doc.descendants((node, position) => {
    if (node.type !== codeBlockType) return
    if (position <= preferredPosition && preferredPosition <= position + node.nodeSize) {
      containingPosition = position
      return false
    }
    if (position >= preferredPosition) {
      if (followingPosition === null) followingPosition = position
      return false
    }
    precedingPosition = position
    return false
  })

  const codeBlockPosition = containingPosition ?? followingPosition ?? precedingPosition
  if (codeBlockPosition !== null) return TextSelection.create(tr.doc, codeBlockPosition + 1)
  return TextSelection.near(tr.doc.resolve(preferredPosition), -1)
}

/**
 * 自定义围栏输入规则 + 回车键（补充内置规则）：
 * 支持 ~~~ 围栏与大写语言名（如 ```Python），
 * 输入 ```python / ~~~python + 空格或回车即创建带语言的代码块。
 * L10：PM 输入规则只对文本输入生效，物理 Enter 由 keymap 抢先处理，
 * 原来的 `[\s\n]$` 里回车分支实际是死代码。
 */
/** 围栏输入规则：```python + 空格 创建带语言的代码块 */
export const customCodeFenceRule = $prose((ctx) => {
  const codeBlockType = ctx.get(schemaCtx).nodes.code_block
  return inputRules({
    rules: [
      // GFM 删除线规则会把 ~~~ 识别成 `~` 包裹的内容。
      // 第三个波浪号输入时直接创建代码块，避免被删除线规则抢先处理。
      new InputRule(/^~~~$/, (state, _match, start, end) => {
        if (!codeBlockType) return null
        const tr = state.tr.replaceRangeWith(start, end, codeBlockType.create({ language: '' }))
        const mappedStart = Math.min(tr.mapping.map(start), tr.doc.content.size)
        return tr
          .setSelection(createCodeBlockSelection(tr, codeBlockType, mappedStart))
          .scrollIntoView()
      }),
      new InputRule(
        /^(```|~~~)([A-Za-z0-9+#.-]*)[\s]$/,
        (state, match, start, end) => {
          if (!codeBlockType) return null
          const language = normalizeCodeLanguage(match[2] ?? '')
          const node = codeBlockType.create({ language })
          const tr = state.tr.replaceRangeWith(start, end, node)
          const mappedStart = Math.min(tr.mapping.map(start), tr.doc.content.size)
          return tr
            .setSelection(createCodeBlockSelection(tr, codeBlockType, mappedStart))
            .scrollIntoView()
        },
      ),
    ],
  })
})

export const createCodeFenceEnterTransaction = (state: EditorState): Transaction | null => {
  if (!state.selection.empty) return null
  const { $from } = state.selection
  if ($from.parent.type.name !== 'paragraph') return null
  if ($from.parentOffset !== $from.parent.content.size) return null

  const match = /^(```|~~~)([A-Za-z0-9+#.-]*)\s*$/.exec($from.parent.textContent)
  const codeBlockType = state.schema.nodes.code_block
  if (!match || !codeBlockType) return null

  const language = normalizeCodeLanguage(match[2] ?? '')
  const node = codeBlockType.create({ language })
  const blockStart = $from.before()
  const blockEnd = $from.after()
  const tr = state.tr.replaceWith(blockStart, blockEnd, node)
  const mappedStart = Math.min(tr.mapping.map(blockStart), tr.doc.content.size)
  return tr
    .setSelection(createCodeBlockSelection(tr, codeBlockType, mappedStart))
    .scrollIntoView()
}

/**
 * 围栏回车键：光标处于完整围栏行末尾（```python 无尾随空格）时，
 * Enter 直接建代码块。L10：PM 输入规则只对文本输入生效，物理 Enter
 * 由 keymap 抢先处理，原输入规则里的 \n 分支实际是死代码。
 * 须注册在 commonmark 预设之前才能抢先其 Enter 绑定。
 */
export const customCodeFenceKeymap = $prose(() => {
  return keymap({
    Enter: (state, dispatch) => {
      const transaction = createCodeFenceEnterTransaction(state)
      if (!transaction) return false
      if (dispatch) dispatch(transaction)
      return true
    },
  })
})
