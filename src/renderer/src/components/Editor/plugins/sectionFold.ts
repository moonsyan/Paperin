import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorState } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import { selectAll } from '@milkdown/kit/prose/commands'
import { analyzeDecorationChange } from './decoOptimize'
import { viewportChangedKey, streamInsertKey, readVisibleRange } from '../viewport/editorViewport'
import { isImeComposing } from '../../../lib/keyboard'

/* ==================== 标题段落折叠（点击标题左侧折叠/展开，对标 Typora） ==================== */

export const sectionFoldKey = new PluginKey('section-fold')

interface FoldRange {
  start: number
  /** 标题节点自身结束位置（start + nodeSize，标题文本始终可见） */
  nodeEnd: number
  /** 区块结束位置（下一个同级/更高级标题或文档末尾） */
  end: number
  level: number
}

/** 计算所有标题区块范围（含未折叠的），供折叠装饰与选区/搜索处理复用 */
function computeFoldRanges(doc: ProseNode): FoldRange[] {
  const headings: FoldRange[] = []
  doc.forEach((node, offset) => {
    if (node.type.name === 'heading') {
      headings.push({ start: offset, nodeEnd: offset + node.nodeSize, end: offset + node.nodeSize, level: node.attrs.level as number })
    }
  })
  const ranges: FoldRange[] = []
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]
    let end = doc.content.size
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= h.level) {
        end = headings[j].start
        break
      }
    }
    ranges.push({ ...h, end })
  }
  return ranges
}

/**
 * 光标/搜索位置是否落在已折叠区块内。
 * 返回所属标题位置；未折叠或不在隐藏区返回 null。
 * 隐藏区 = [nodeEnd, end)（标题文本本身始终可见）
 */
export function collapsedRangeAt(state: EditorState, pos: number): { heading: number } | null {
  const pluginState = sectionFoldKey.getState(state) as { collapsed: Set<number> } | undefined
  if (!pluginState || pluginState.collapsed.size === 0) return null
  for (const range of computeFoldRanges(state.doc)) {
    if (!pluginState.collapsed.has(range.start)) continue
    if (pos >= range.nodeEnd && pos < range.end) {
      return { heading: range.start }
    }
  }
  return null
}

/** 构建折叠装饰：已折叠区块始终隐藏，仅对视口内标题生成折叠按钮。
 * 隐藏装饰不能随标题离开视口而移除，否则折叠章节会视觉展开并导致滚动跳变。 */
export function buildFoldDecos(
  state: EditorState,
  collapsed: Set<number>,
  visibleRange = readVisibleRange(state.doc),
): DecorationSet {
  const doc = state.doc
  const decos: Decoration[] = []
  const ranges = computeFoldRanges(doc)
  const { from, to } = visibleRange
  for (const range of ranges) {
    const h = range
    if (collapsed.has(h.start)) {
      doc.forEach((node, offset) => {
        if (offset > h.start && offset < h.end) {
          decos.push(Decoration.node(offset, offset + node.nodeSize, { class: 'folded-hidden' }))
        }
      })
    }
    if (h.start < from || h.start > to) continue
    // L14：widget 工厂与 destroy 回调同级，监听器引用需提升到循环作用域
    // （基类 Event 自带 preventDefault/stopPropagation，Handler 只需 EventListener 签名）。
    // M2：不再给 widget 加 key——PM 按 key 复用 DOM 且不重跑工厂，重建后
    // 箭头方向/点击闭包全成了旧快照。无 key 时每次 buildFoldDecos（折叠切换、
    // 标题增删、文档切换）都重建 DOM 与监听器，方向永远正确；
    // 经 DecorationSet.map 复用 DOM 的路径（段落内打字）由 handler 实时
    // getPos + 读最新插件状态兜底
    decos.push(
      (() => {
        let removeListener: (() => void) | null = null
        return Decoration.widget(
          // h.start + 1：放进标题内容首位，widget DOM 成为标题子元素——
          // 标题相对定位（left: -1.3em）与 :hover 显隐选择器才能生效；
          // 放在 h.start 时 widget 是标题的兄弟节点，所有箭头会堆叠到
          // 编辑器左上角同一位置（absolute 相对 .milkdown 解析）
          h.start + 1,
          (view: EditorView, getPos: () => number | undefined) => {
            const el = document.createElement('span')
            const isCollapsed = collapsed.has(h.start)
            el.className = 'fold-toggle' + (isCollapsed ? ' collapsed' : '')
            el.textContent = isCollapsed ? '▸' : '▾'
            // widget 是标题子元素：对无障碍树隐藏符号，保持标题可读名称干净
            el.setAttribute('aria-hidden', 'true')
            const onMousedown: EventListener = (e) => {
              e.preventDefault()
              // L14：replaceAll flush / 编辑器销毁后 widget 可能持有失效视图，
              // 直接 dispatch 会抛错；已销毁则忽略本次点击
              if (view.isDestroyed) return
              // M2：DOM 经映射复用后，闭包里的 h.start 是旧坐标、isCollapsed 是
              // 旧状态。点击时实时取当前位置与最新折叠状态，映射后的箭头才能
              // 正确折叠/展开，并自修正因复用而过期的箭头方向。
              // widget 在标题内容首位，getPos() 返回 h.start + 1，换算回收缩键
              const pos = getPos()
              if (typeof pos !== 'number') return
              const headingStart = pos - 1
              const pluginState = sectionFoldKey.getState(view.state) as
                | { collapsed: Set<number> }
                | undefined
              const isNowCollapsed = pluginState?.collapsed.has(headingStart) ?? false
              el.classList.toggle('collapsed', !isNowCollapsed)
              el.textContent = isNowCollapsed ? '▸' : '▾'
              let tr = view.state.tr
              if (!isNowCollapsed) {
                // M12：折叠时若光标在将被隐藏的区块内，把选区移到标题文本末尾，
                // 否则光标落进 display:none 的内容里，后续打字全是盲改
                const sel = view.state.selection
                const ranges = computeFoldRanges(view.state.doc)
                for (let i = 0; i < ranges.length; i++) {
                  const r = ranges[i]
                  if (r.start !== headingStart) continue
                  if (r.end > r.nodeEnd && sel.from >= r.nodeEnd && sel.from < r.end) {
                    tr = tr.setSelection(TextSelection.create(tr.doc, r.nodeEnd - 1))
                  }
                  break
                }
              }
              view.dispatch(tr.setMeta(sectionFoldKey, { toggle: headingStart }))
            }
            el.addEventListener('mousedown', onMousedown)
            removeListener = () => el.removeEventListener('mousedown', onMousedown)
            return el
          },
          {
            side: -1,
            ignoreSelection: true,
            // L14：装饰重建时移除监听，避免闭包持有已失效的 view
            destroy: () => {
              removeListener?.()
              removeListener = null
            },
          },
        )
      })(),
    )
  }
  return DecorationSet.create(doc, decos)
}

export const sectionFoldPlugin = new Plugin({
  key: sectionFoldKey,
  state: {
    init: (): { collapsed: Set<number>; decos: DecorationSet } => ({
      collapsed: new Set<number>(),
      decos: DecorationSet.empty,
    }),
    apply(tr, prev, _old, newState) {
      const previous = prev as { collapsed: Set<number>; decos: DecorationSet }
      // 3.1 Tier 2：分块流式插入的事务标记——跳过重扫，仅映射已有装饰并保留折叠集，
      // 避免 N 块 × O(doc) 退化为 O(doc²)；流结束时由 viewportChangedKey 一次性重建。
      if (tr.getMeta(streamInsertKey)) {
        return { collapsed: previous.collapsed, decos: previous.decos.map(tr.mapping, tr.doc) }
      }
      const meta = tr.getMeta(sectionFoldKey)
      if (meta && meta.reset) {
        // 切换文档（replaceContent）时清空，避免旧文件的折叠位置映射泄漏到新文档
        return { collapsed: new Set<number>(), decos: buildFoldDecos(newState, new Set()) }
      }
      if (meta && meta.toggle !== undefined) {
        const collapsed = new Set(previous.collapsed)
        if (collapsed.has(meta.toggle)) collapsed.delete(meta.toggle)
        else collapsed.add(meta.toggle)
        return { collapsed, decos: buildFoldDecos(newState, collapsed) }
      }
      if (meta && meta.expandAll) {
        // G-M2：Ctrl+A 前展开全部折叠，全选语义完整、隐藏内容可一并操作
        return { collapsed: new Set<number>(), decos: buildFoldDecos(newState, new Set()) }
      }
      // 3.1 Tier 1：滚动跨越视口边界后，只在视口内重建折叠装饰（buildFoldDecos 已限区间）
      if (tr.getMeta(viewportChangedKey)) {
        return { collapsed: previous.collapsed, decos: buildFoldDecos(newState, previous.collapsed) }
      }
      if (!tr.docChanged) return previous
      // 文档变化后重新映射折叠位置，跳过已不存在的标题
      const collapsed = new Set<number>()
      previous.collapsed.forEach((pos) => {
        const m = tr.mapping.map(pos)
        if (m != null && m <= tr.doc.content.size) {
          const node = tr.doc.nodeAt(m)
          if (node && node.type.name === 'heading') collapsed.add(m)
        }
      })
      // M13：段落/标题内打字不改变折叠结构，映射复用旧装饰，
      // 避免每次按键全文档扫描重建（新增/删除标题时切片含 heading，才需重建）
      const info = analyzeDecorationChange(tr)
      // G-L3：setNodeMarkup（如标题级别 # → ##）无 slice，切片不含 heading 会走
      // 快速路径复用旧装饰，但折叠范围 [nodeEnd, end) 依赖标题级别——级别变化后
      // 隐藏范围与真实折叠范围不一致（可能隐藏了不该隐藏的块）。检测到即重建
      let markupHeading = false
      for (const step of tr.steps) {
        const s = step as { pos?: number; markup?: unknown }
        if (typeof s.pos === 'number' && s.markup !== undefined) {
          const node = tr.doc.nodeAt(tr.mapping.map(s.pos))
          if (node && node.type.name === 'heading') {
            markupHeading = true
            break
          }
        }
      }
      if (!markupHeading && !info.sliceBlocks.has('heading')) {
        // M2 补丁：删除起点恰为标题起点的纯删除/替换事务（选中标题起点向后
        // 删除、Ctrl+A 后输入等）不会让 StepMap 把该标题的折叠箭头标记为删除
        // （mapResult(pos, -1) 对 pos == 删除起点不置 deleted），映射后箭头
        // 悬在非标题位置成为幽灵。逐个检查各步插入点：该处若存在 widget 装饰
        // 但新 doc 上不是标题，即按新 doc 重建丢弃陈旧箭头。
        // 常规打字/删字的插入点要么没有折叠箭头、要么仍在标题上，不重建
        const mappedDecos = previous.decos.map(tr.mapping, tr.doc)
        let ghost = false
        for (let i = 0; i < tr.steps.length && !ghost; i++) {
          const step = tr.steps[i] as { from?: number } | undefined
          if (typeof step?.from !== 'number') continue
          const ins = tr.mapping.map(step.from)
          if (ins < 0 || ins > tr.doc.content.size) continue
          const at = mappedDecos.find(ins, ins + 1)
          let hasWidget = false
          for (let j = 0; j < at.length; j++) {
            // widget 是 prosemirror-view 的运行时 getter（WidgetType 实例），
            // 类型声明未暴露，按结构访问
            if ((at[j] as unknown as { widget: unknown }).widget) {
              hasWidget = true
              break
            }
          }
          if (!hasWidget) continue
          const node = tr.doc.nodeAt(ins)
          if (!node || node.type.name !== 'heading') ghost = true
        }
        if (!ghost) {
          return { collapsed, decos: mappedDecos }
        }
      }
      return { collapsed, decos: buildFoldDecos(newState, collapsed) }
    },
  },
  props: {
    decorations(state) {
      return sectionFoldKey.getState(state).decos as DecorationSet
    },
    // G-M2：折叠仅用 display:none 隐藏，光标可经方向键/全选进入隐藏区，
    // 输入落到不可见内容、Ctrl+A 后输入静默删除折叠内容。这里做三层守卫：
    // ① Ctrl/Cmd+A 先展开全部折叠再全选（全选语义完整）；
    // ② 选区已在隐藏区内的任何按键 → clamp 回所属标题文本末尾（防盲打）；
    // ③ ↓/→ 从折叠标题向隐藏区移动 → 跳到隐藏区后的可见位置；
    //    ↑/← 从隐藏区末尾向回移 → clamp 回标题文本末尾
    handleKeyDown(view, event) {
      const pluginState = sectionFoldKey.getState(view.state) as
        | { collapsed: Set<number> }
        | undefined
      if (!pluginState || pluginState.collapsed.size === 0) return false
      const selFrom = view.state.selection.from
      if ((event.ctrlKey || event.metaKey) && (event.key === 'a' || event.key === 'A')) {
        event.preventDefault()
        view.dispatch(view.state.tr.setMeta(sectionFoldKey, { expandAll: true }))
        selectAll(view.state, (tr) => view.dispatch(tr))
        return true
      }
      const ranges = computeFoldRanges(view.state.doc)
      const hit = collapsedRangeAt(view.state, selFrom)
      if (hit) {
        // 组合键（Ctrl/Cmd/Alt，如撤销/复制/粘贴/剪切）放行给 ProseMirror 默认处理，
        // 避免折叠隐藏区内误吞基础编辑快捷键
        if (event.ctrlKey || event.metaKey || event.altKey) return false
        // IME 组合期间（keyCode 229）不吞键也不强制移动光标，
        // 否则组合输入被打断、候选窗口错位（与 useEditorNavigation 的守卫一致）
        if (isImeComposing(event)) return false
        // 光标已在隐藏区（方向键误入后输入/删除）→ 拦回标题文本末尾
        event.preventDefault()
        const r = ranges.find((x) => x.start === hit.heading)
        const clampTo = (r ? r.nodeEnd : hit.heading) - 1
        if (selFrom !== clampTo) {
          view.dispatch(
            view.state.tr.setSelection(TextSelection.create(view.state.doc, clampTo)),
          )
        }
        return true
      }
      const isDown = event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'ArrowRight'
      const isUp = event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'ArrowLeft'
      if (isDown || isUp) {
        for (const r of ranges) {
          if (!pluginState.collapsed.has(r.start) || r.end <= r.nodeEnd) continue
          if (isDown && selFrom >= r.start && selFrom < r.nodeEnd) {
            // ↓/→：从折叠标题文本向隐藏区移动 → 跳到隐藏区后的可见位置
            event.preventDefault()
            view.dispatch(
              view.state.tr
                .setSelection(TextSelection.create(view.state.doc, r.end))
                .scrollIntoView(),
            )
            return true
          }
          if (isUp && (selFrom === r.end || selFrom === r.end - 1)) {
            // ↑/←：光标紧贴隐藏区末尾向回移 → clamp 回标题文本末尾
            event.preventDefault()
            view.dispatch(
              view.state.tr.setSelection(TextSelection.create(view.state.doc, r.nodeEnd - 1)),
            )
            return true
          }
        }
      }
      return false
    },
  },
})
