import { Plugin, PluginKey, EditorState } from '@milkdown/kit/prose/state'
import type { Transaction } from '@milkdown/kit/prose/state'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import { readVisibleRange } from '../editorViewport'
import { sectionFoldKey } from './sectionFold'

/* ==================== 章节拖拽排序（标题悬浮手柄，同级之间排序） ==================== */

export const sectionReorderKey = new PluginKey('section-reorder')

interface TopHeading {
  pos: number
  end: number
  level: number
}

/** 顶层标题及其章节区间（end = 下一个 level <= 本级的标题起点或文档末尾），与 sectionFold 同口径 */
const collectTopHeadings = (doc: PMNode): TopHeading[] => {
  const starts: { pos: number; level: number }[] = []
  doc.forEach((node, offset) => {
    if (node.type.name === 'heading') {
      starts.push({ pos: offset, level: node.attrs.level as number })
    }
  })
  return starts.map((h, i) => {
    let end = doc.content.size
    for (let j = i + 1; j < starts.length; j++) {
      if (starts[j].level <= h.level) {
        end = starts[j].pos
        break
      }
    }
    return { ...h, end }
  })
}

/** 标题及其全部子内容的区间；pos 不是顶层标题（或在 Frontmatter/围栏代码等嵌套块内）时返回 null */
export const findSectionRange = (
  doc: PMNode,
  pos: number,
): { from: number; to: number } | null => {
  if (pos < 0 || pos > doc.content.size) return null
  const $pos = doc.resolve(pos)
  // 仅支持文档顶层标题：blockquote/列表内的标题移动会改变嵌套结构，不做
  let node: PMNode | null = null
  let from = pos
  if ($pos.depth === 1) {
    node = $pos.parent
    from = $pos.before(1)
  } else if ($pos.depth === 0) {
    const after = doc.childAfter(pos)
    node = after.node
    from = after.offset
  }
  if (!node || node.type.name !== 'heading') return null
  const level = node.attrs.level as number
  let to = doc.content.size
  for (const h of collectTopHeadings(doc)) {
    if (h.pos > from && h.level <= level) {
      to = h.pos
      break
    }
  }
  return { from, to }
}

/**
 * 将章节区间整体移动到 beforePos 之前。
 * 规则固定为"同级之间排序"：目标必须是同级标题起点或文档末尾，且移动前后
 * 逻辑父级（最近一级更高级标题）不变；移入自身子树等非法移动返回 null。
 * 返回单事务（删除 + 插入两步），一次 dispatch 即可一步撤销。
 */
export const moveSectionTo = (
  doc: PMNode,
  range: { from: number; to: number },
  beforePos: number,
): Transaction | null => {
  const { from, to } = range
  if (!(from < to) || beforePos < 0 || beforePos > doc.content.size) return null
  const heading = doc.nodeAt(from)
  if (!heading || heading.type.name !== 'heading') return null
  const level = heading.attrs.level as number
  // 目标在自身区间内或紧贴自身边界（起点/终点）都视为非法或无意义移动
  if (beforePos > from && beforePos <= to) return null
  if (beforePos !== doc.content.size) {
    const target = doc.nodeAt(beforePos)
    if (!target || target.type.name !== 'heading' || (target.attrs.level as number) !== level) {
      return null
    }
  }

  const headings = collectTopHeadings(doc)
  // 其余标题（排除自身章节）按文档顺序构成的序列
  const others = headings.filter((h) => h.pos < from || h.pos >= to)
  const beforeIdx = others.filter((h) => h.pos < from).length
  const insertIdx =
    beforePos === doc.content.size
      ? others.length
      : others.findIndex((h) => h.pos === beforePos)
  if (insertIdx < 0) return null
  // 移动前后逻辑父级必须一致，否则属于跨层级重排
  const nearestHigher = (list: TopHeading[], fromIdx: number): number => {
    for (let i = fromIdx - 1; i >= 0; i--) {
      if (list[i].level < level) return i
    }
    return -1
  }
  if (nearestHigher(others, beforeIdx) !== nearestHigher(others, insertIdx)) return null

  const tr = EditorState.create({ doc }).tr
  const slice = doc.slice(from, to)
  tr.delete(from, to)
  // 先删后插：目标在区间之后时位置前移一个区间长度
  tr.insert(beforePos > from ? beforePos - (to - from) : beforePos, slice.content)
  return tr
}

/** 构建拖拽手柄装饰：仅视口内顶层标题；代码块/frontmatter 内的伪标题不生成 */
export const buildReorderDecos = (
  state: EditorState,
  dragging: { from: number; to: number } | null,
  dropAt: number | null,
): DecorationSet => {
  const doc = state.doc
  const { from: visibleFrom, to: visibleTo } = readVisibleRange(doc)
  const decos: Decoration[] = []
  for (const h of collectTopHeadings(doc)) {
    if (h.pos < visibleFrom || h.pos > visibleTo) continue
    decos.push(
      Decoration.widget(
        // h.pos + 1：放进标题内容首位，widget DOM 成为标题子元素，
        // 标题相对定位（left: -2.4em）与 :hover 显隐选择器才能生效
        h.pos + 1,
        (view: EditorView, getPos: () => number | undefined) => {
          const el = document.createElement('span')
          el.className = 'section-drag-handle'
          el.draggable = true
          // 对无障碍树隐藏手柄（非可聚焦装饰），标题可读名称不受影响
          el.setAttribute('aria-hidden', 'true')
          el.title = '拖拽调整章节顺序'
          el.textContent = '⋮⋮'
          el.addEventListener('dragstart', (event) => {
            if (view.isDestroyed) return
            const pos = getPos()
            if (typeof pos !== 'number') return
            // widget 在标题内容内，任意位置都能解析出所属章节
            const range = findSectionRange(view.state.doc, pos)
            if (!range) return
            event.dataTransfer?.setData('text/plain', view.state.doc.nodeAt(pos)?.textContent ?? '')
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
            // 与 sectionFold 协作：拖拽前展开全部折叠章节，避免子内容静默丢位
            const foldState = sectionFoldKey.getState(view.state) as
              | { collapsed: Set<number> }
              | undefined
            if (foldState && foldState.collapsed.size > 0) {
              view.dispatch(view.state.tr.setMeta(sectionFoldKey, { expandAll: true }))
            }
            view.dispatch(view.state.tr.setMeta(sectionReorderKey, { dragStart: range }))
          })
          el.addEventListener('dragend', () => {
            if (view.isDestroyed) return
            view.dispatch(view.state.tr.setMeta(sectionReorderKey, { dragEnd: true }))
          })
          return el
        },
        {
          side: -1,
          ignoreSelection: true,
          // 与折叠箭头共存：拖拽中隐藏本章节的手柄，落点指示由独立装饰渲染
          class: dragging && dragging.from === h.pos ? 'section-drag-active' : undefined,
        },
      ),
    )
  }
  if (dragging && dropAt != null) {
    decos.push(Decoration.widget(dropAt, () => {
      const el = document.createElement('span')
      el.className = 'section-drop-indicator'
      return el
    }, { side: 1, ignoreSelection: true, key: 'section-drop-indicator' }))
  }
  return DecorationSet.create(doc, decos)
}

/** 计算"拖到某点"应落位的目标标题起点：所在或其后最近的同级标题起点，无则文档末尾 */
const resolveDropPos = (doc: PMNode, level: number, coordsPos: number): number => {
  for (const h of collectTopHeadings(doc)) {
    if (h.pos >= coordsPos && h.level === level) return h.pos
  }
  return doc.content.size
}

export const sectionReorderPlugin = new Plugin({
  key: sectionReorderKey,
  state: {
    init: (_config, state): { dragging: { from: number; to: number } | null; dropAt: number | null; decos: DecorationSet } => ({
      dragging: null,
      dropAt: null,
      decos: buildReorderDecos(state, null, null),
    }),
    apply(tr, prev, _old, newState) {
      const meta = tr.getMeta(sectionReorderKey) as
        | { dragStart?: { from: number; to: number }; dragEnd?: boolean; dropAt?: number | null }
        | undefined
      const prev2 = prev as { dragging: { from: number; to: number } | null; dropAt: number | null; decos: DecorationSet }
      if (meta?.dragStart) {
        return { dragging: meta.dragStart, dropAt: null, decos: buildReorderDecos(newState, meta.dragStart, null) }
      }
      if (meta?.dragEnd) {
        return { dragging: null, dropAt: null, decos: buildReorderDecos(newState, null, null) }
      }
      if (meta?.dropAt !== undefined && prev2.dragging) {
        return { ...prev2, dropAt: meta.dropAt, decos: buildReorderDecos(newState, prev2.dragging, meta.dropAt) }
      }
      if (!tr.docChanged) return prev2
      // 文档变化（含拖放落位）后清空拖拽态；手柄按新文档重建
      return { dragging: null, dropAt: null, decos: buildReorderDecos(newState, null, null) }
    },
  },
  props: {
    decorations(state) {
      return (sectionReorderKey.getState(state) as { decos: DecorationSet }).decos
    },
    // 拖拽悬停必须阻止默认行为，否则 drop 事件不会派发；
    // 仅在解析出的落点变化时派发事务，避免高频 dragover 反复重建装饰
    handleDOMEvents: {
      dragover(view, event) {
        const pluginState = sectionReorderKey.getState(view.state) as
          | { dragging: { from: number; to: number } | null; dropAt: number | null }
          | undefined
        if (!pluginState?.dragging) return false
        event.preventDefault()
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (!coords) return true
        const range = findSectionRange(view.state.doc, pluginState.dragging.from)
        if (!range) return true
        const heading = view.state.doc.nodeAt(range.from)
        const level = (heading?.attrs.level as number) ?? 1
        const target = resolveDropPos(view.state.doc, level, coords.pos)
        if (target !== pluginState.dropAt) {
          view.dispatch(view.state.tr.setMeta(sectionReorderKey, { dropAt: target }))
        }
        return true
      },
    },
    handleDrop(view, event) {
      const pluginState = sectionReorderKey.getState(view.state) as
        | { dragging: { from: number; to: number } | null }
        | undefined
      if (!pluginState?.dragging) return false
      event.preventDefault()
      const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!coords) return true
      const range = findSectionRange(view.state.doc, pluginState.dragging.from)
      if (!range) return true
      const heading = view.state.doc.nodeAt(range.from)
      const level = (heading?.attrs.level as number) ?? 1
      const target = resolveDropPos(view.state.doc, level, coords.pos)
      const tr = moveSectionTo(view.state.doc, range, target)
      if (!tr) return true
      view.dispatch(tr)
      return true
    },
  },
})
