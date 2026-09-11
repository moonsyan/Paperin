import { PluginKey } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'

/**
 * 3.1 Tier 1 / Tier 2：视口范围协作模块。
 * ProseMirror 核心不提供原生 visibleRanges（Marijn 明确其不内置虚拟化），
 * 这里自行用编辑器滚动容器坐标 + posAtCoords 反算当前可见的文档区间，
 * 并在滚动跨越区块边界时下发一个 meta 事务，让装饰插件只重建视口内装饰。
 *
 * - viewportChangedKey：滚动/分块流式插入结束时触发，装饰插件据此在视口内重算。
 * - streamInsertKey：分块流式插入（Tier 2）每块事务的标记；装饰插件据此跳过重扫、
 *   仅映射已有装饰，避免 N 块 × O(doc) 退化为 O(doc²)。
 */

export const viewportChangedKey = new PluginKey('viewport-changed')
export const streamInsertKey = new PluginKey('stream-insert')

/** 视口上下各保留的文档位置余量（≈ 几个屏幕），避免滚动时装饰频繁 pop-in/out */
const VIEWPORT_MARGIN_POS = 6000

let cachedRange: { from: number; to: number } | null = null
let hasRange = false
/** 导出快照临时取消视口限定：置 true 后 readVisibleRange 返回整篇文档，
 * 让装饰插件全量重建（Mermaid 视口外的图也能渲染进导出结果）。
 * getPreviewHtml 捕获完成后必须复位，否则大文档装饰永久全量。 */
let fullRangeOverride = false

export function setFullRangeOverride(on: boolean): void {
  fullRangeOverride = on
}

/** 复位导出全量视口，并告知调用方本次是否实际消费了启用状态。 */
export function restoreFullRangeOverride(): boolean {
  if (!fullRangeOverride) return false
  fullRangeOverride = false
  return true
}

/**
 * 读取当前缓存的可见区间。装饰插件在 state.apply 内没有 view 句柄，
 * 只能读模块级缓存（由 installViewportTracker 在 view 侧更新）。
 * 尚未计算过视口（如初始 init）时回退整篇文档，保证装饰不遗漏。
 */
export function readVisibleRange(doc: ProseNode): { from: number; to: number } {
  if (fullRangeOverride || !hasRange || !cachedRange) return { from: 0, to: doc.content.size }
  return {
    from: Math.max(0, cachedRange.from),
    to: Math.min(doc.content.size, cachedRange.to),
  }
}

/**
 * 安装视口追踪器：滚动/缩放（rAF 节流）时重算可见区间，跨越余量边界才下发
 * viewportChangedKey 事务，避免每像素都触发装饰重建。挂载时先做一次性计算，
 * 把大文档初始加载后视口外的装饰 DOM 裁掉。返回卸载函数。
 */
/** 同步重算可见区间（不等待滚动事件）：文档整体替换后调用。cachedRange 属于
 * 上一篇文档，若不重算，新文档的装饰会按旧区间残缺到用户首次滚动。
 * silent=true 只更新区间不下发 viewportChangedKey，由调用方自行触发重建。 */
let refreshCompute: ((silent: boolean) => void) | null = null

export function refreshViewportRange(): void {
  refreshCompute?.(true)
}

export function installViewportTracker(view: EditorView): () => void {
  const scrollEl = (view.dom.closest('.editor-scroll') as HTMLElement | null) ??
    (view.dom.parentElement as HTMLElement | null)
  if (!scrollEl) return () => undefined

  let rafId = 0
  let lastFrom = -1
  let lastTo = -1

  const compute = (silent = false) => {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    if (view.isDestroyed) return
    const doc = view.state.doc
    const rect = scrollEl.getBoundingClientRect()
    const top = view.posAtCoords({ left: rect.left + 4, top: rect.top + 4 })
    const bottom = view.posAtCoords({ left: rect.left + 4, top: rect.bottom - 4 })
    let from = top ? top.pos : 0
    let to = bottom ? bottom.pos : doc.content.size
    from = Math.max(0, from - VIEWPORT_MARGIN_POS)
    to = Math.min(doc.content.size, to + VIEWPORT_MARGIN_POS)
    cachedRange = { from, to }
    hasRange = true
    if (
      from < lastFrom - VIEWPORT_MARGIN_POS / 2 ||
      from > lastFrom + VIEWPORT_MARGIN_POS / 2 ||
      to < lastTo - VIEWPORT_MARGIN_POS / 2 ||
      to > lastTo + VIEWPORT_MARGIN_POS / 2
    ) {
      lastFrom = from
      lastTo = to
      if (!silent && !view.isDestroyed) {
        view.dispatch(view.state.tr.setMeta(viewportChangedKey, true))
      }
    }
  }

  // 单编辑器实例；重复安装（HMR 等）以最新 tracker 为准
  refreshCompute = compute

  const onScroll = () => {
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = 0
      compute()
    })
  }

  scrollEl.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  // 初始计算：打开大文档后裁掉视口外装饰 DOM
  rafId = requestAnimationFrame(() => {
    rafId = 0
    compute()
  })

  return () => {
    scrollEl.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    if (rafId) cancelAnimationFrame(rafId)
    if (refreshCompute === compute) refreshCompute = null
  }
}
