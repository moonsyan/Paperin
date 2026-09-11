import { Plugin, PluginKey, type Transaction } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import type { MutableRefObject } from 'react'
import { collectActiveHeading } from '../navigation/editorHeadings'
import type { EditorProps } from '../editor-types'

/**
 * 光标位置上报插件：向状态栏/大纲提供行、列、所属标题与选中字数。
 * rAF 节流，连续输入每帧只算一次。
 *
 * 职责边界：光标坐标换算、按块缓存、缓存失效判定。
 * 不包含：标题枚举口径（由 navigation/editorHeadings 统一定义）。
 */

/** 光标所在块的缓存：块内移动时只重算块内偏移，避免每次按键 O(doc) 扫描。 */
interface BlockCursorCache {
  blockStart: number
  /** 当前块之前已占用的完整行数（含块间分隔与图片/硬换行） */
  prefixLines: number
  /** 当前块之前是否还有文本内容（决定块首边界是否计一行） */
  hasPrefixText: boolean
  heading: string
  headingIndex: number
}

export const createCursorReportPlugin = (
  cursorRef: MutableRefObject<EditorProps['onCursorChange']>,
) =>
  $prose(() => {
    const key = new PluginKey('cursor-report')
    // L6：最近一次事务（state.apply 在 view.update 之前执行）。
    // update 只拿到新旧 state、拿不到 tr，事务范围判定只能经此中转
    let lastTr: Transaction | null = null
    return new Plugin({
      key,
      state: {
        init: () => null,
        apply(tr) {
          lastTr = tr
          return null
        },
      },
      view: () => {
        let raf = 0
        /**
         * C-12：光标位置/章节信息按块缓存。光标在同一块内移动（每次按键、
         * 方向键）只重算块内偏移，不再每次 textBetween(0, from) 拷贝全文、
         * 不再遍历整篇文档统计标题——大文档上每次按键的扫描成本从 O(doc)
         * 降到 O(块)。
         */
        let blockCache: BlockCursorCache | null = null

        const report = (view: EditorView): void => {
          const fn = cursorRef.current
          if (!fn) return
          const { from } = view.state.selection
          const $from = view.state.doc.resolve(from)
          const block = $from.parent
          if (!block.isTextblock) {
            // 光标在块边界/非文本位置（图片等）：回退旧式全文计算，此场景不常见
            blockCache = null
            const text = view.state.doc.textBetween(0, from, '\n', '\n')
            const lines = text.split('\n')
            const heads = collectActiveHeading(view.state.doc, from)
            fn(lines.length, lines[lines.length - 1].length + 1, heads.heading, heads.headingIndex, 0)
            return
          }
          const blockStart = $from.start()
          if (!blockCache || blockCache.blockStart !== blockStart) {
            const prefixText = view.state.doc.textBetween(0, blockStart, '\n', '\n')
            const heads = collectActiveHeading(view.state.doc, blockStart)
            blockCache = {
              blockStart,
              prefixLines: prefixText.split('\n').length - 1,
              hasPrefixText: prefixText.length > 0,
              heading: heads.heading,
              headingIndex: heads.headingIndex,
            }
          }
          // 与旧公式 textBetween(0, from) 等价：
          // 行数 = 块前缀行数 + 块首边界行（光标已进入块内且块前有内容）+ 块内行数 + 1
          const within = view.state.doc.textBetween(blockStart, from, '\n', '\n')
          const withinLines = within.split('\n')
          const boundaryLine = from > blockStart && blockCache.hasPrefixText ? 1 : 0
          const row = blockCache.prefixLines + boundaryLine + withinLines.length
          const col = withinLines[withinLines.length - 1].length + 1
          let heading = blockCache.heading
          const headingIndex = blockCache.headingIndex
          // 光标所在块自身是 h1-h4 标题时，标题文本随编辑实时更新
          if (block.type.name === 'heading') {
            const level = block.attrs.level as number
            if (level >= 1 && level <= 4) heading = block.textContent
          }
          // 选中字数（去空白，无选区为 0）
          const { from: selFrom, to: selTo } = view.state.selection
          const selectedChars =
            selFrom >= selTo
              ? 0
              : view.state.doc.textBetween(selFrom, selTo).replace(/\s/g, '').length
          fn(row, col, heading, headingIndex, selectedChars)
        }

        /** 事务是否改动了光标块之前的内容（决定块缓存是否作废）。 */
        const changedAboveCache = (tr: Transaction, cache: BlockCursorCache): boolean => {
          for (let i = 0; i < tr.steps.length; i++) {
            const step = tr.steps[i] as { from?: number } | undefined
            if (typeof step?.from === 'number' && step.from < cache.blockStart) return true
          }
          return false
        }

        const schedule = (view: EditorView): void => {
          // 已有调度则跳过，回调时读最新 state
          if (raf) return
          raf = requestAnimationFrame(() => {
            raf = 0
            report(view)
          })
        }

        return {
          update: (view, prevState) => {
            // L6：光标块上方文档变化（搜索 replaceAll、wiki 自动转换、
            // 属性面板保存等会改上方行数与标题）时，选区未动也能经
            // blockStart 判缓存命中而沿用旧值，状态栏行号/所属标题过期。
            // 事务起点在光标块之前即作废缓存并调度重算；起点在本块内/之后
            // 不影响上方内容，保持 O(块) 快速路径
            if (lastTr?.docChanged && blockCache && changedAboveCache(lastTr, blockCache)) {
              blockCache = null
              schedule(view)
            }
            if (prevState.selection.eq(view.state.selection)) return
            schedule(view)
          },
          destroy: () => {
            if (raf) cancelAnimationFrame(raf)
          },
        }
      },
    })
  })
