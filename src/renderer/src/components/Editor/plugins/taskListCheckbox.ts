import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

/* ==================== GFM 任务列表复选框 ==================== */

/**
 * gfm 预设的任务列表项只渲染 li[data-item-type='task'][data-checked]
 * 两个数据属性（不产出任何 checkbox 元素），复选框完全依赖 CSS 绘制
 * （见 editor.css 的 ::before 规则）。::before 伪元素的点击命中目标
 * 是 li 自身（伪元素不属于真实 DOM），据此判定点击是否落在复选框区域，
 * 命中即切换 list_item 的 checked 属性。
 */

/** 复选框可点击区域的宽度（与 CSS ::before 的 left/宽度对应，含余量） */
const CHECKBOX_ZONE_WIDTH = 26
/** 复选框可点击区域的高度（覆盖首行行高范围内的伪元素位置） */
const CHECKBOX_ZONE_HEIGHT = 30

export const taskListCheckboxPlugin = $prose(() =>
  new Plugin({
    key: new PluginKey('task-list-checkbox'),
    props: {
      handleClick(view: EditorView, _pos: number, event: MouseEvent) {
        const target = event.target
        if (!(target instanceof HTMLElement)) return false
        const li = target.closest("li[data-item-type='task']")
        if (!li || target !== li) return false
        const rect = li.getBoundingClientRect()
        const inZone =
          event.clientX - rect.left <= CHECKBOX_ZONE_WIDTH &&
          event.clientY - rect.top <= CHECKBOX_ZONE_HEIGHT
        if (!inZone) return false
        // 从点击处向上找最近的 task list_item
        // posAtDOM 对脱离 DOM 的旧元素返回 -1，需安全退出
        const posAtLi = view.posAtDOM(li, 0)
        if (posAtLi < 0) return false
        const $pos = view.state.doc.resolve(posAtLi)
        for (let d = $pos.depth; d > 0; d--) {
          const node = $pos.node(d)
          if (node.type.name !== 'list_item') continue
          if (node.attrs.checked == null) return false
          const nodePos = $pos.before(d)
          view.dispatch(
            view.state.tr.setNodeMarkup(nodePos, undefined, {
              ...node.attrs,
              checked: !node.attrs.checked,
            }),
          )
          return true
        }
        return false
      },
    },
  }),
)
