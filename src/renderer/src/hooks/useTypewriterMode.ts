import { useCallback, useEffect } from 'react'
import type { RefObject } from 'react'

export interface UseTypewriterModeOptions {
  /** 打字机模式开关（由调用方持久化；本 hook 只消费） */
  typewriter: boolean
  /** 编辑区容器（.workspace 根节点，用于定位 .milkdown/.editor-scroll） */
  editorAreaRef: RefObject<HTMLDivElement>
}

/**
 * 打字机模式：光标所在行滚动到可视区中央（rAF 节流，连续输入每帧一次）。
 */
export function useTypewriterMode({
  typewriter,
  editorAreaRef,
}: UseTypewriterModeOptions): { centerCaret: () => void } {
  /** 把光标所在行滚动到可视区中央 */
  const centerCaret = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return
    const root = editorAreaRef.current
    if (!root) return
    const editorEl = root.querySelector('.milkdown .editor')
    const scrollEl = root.querySelector('.editor-scroll') as HTMLElement | null
    if (!editorEl || !scrollEl) return
    const scrollRect = scrollEl.getBoundingClientRect()

    // U1：优先用光标所在行的矩形居中（比块级居中精度更高）
    const range = sel.getRangeAt(0)
    let lineRect: DOMRect | null = null
    const rects = range.getClientRects()
    if (rects.length > 0) lineRect = rects[0] as DOMRect
    if (!lineRect || lineRect.height === 0) {
      const r = range.getBoundingClientRect()
      if (r.height > 0 || r.width > 0) lineRect = r
    }
    if (lineRect && lineRect.height > 0) {
      const target =
        scrollEl.scrollTop +
        (lineRect.top + lineRect.height / 2 - scrollRect.top) -
        scrollRect.height / 2
      // 偏移很小时不滚动，避免连续输入时抖动
      if (Math.abs(scrollEl.scrollTop - target) > 2) {
        scrollEl.scrollTo({ top: target, behavior: 'smooth' })
      }
      return
    }

    // 兜底：无法取到光标矩形时，将光标所在顶层块居中
    let block: HTMLElement | null =
      sel.anchorNode.nodeType === 1
        ? (sel.anchorNode as HTMLElement)
        : sel.anchorNode.parentElement
    while (block && block.parentElement !== editorEl) block = block.parentElement
    if (!block || block.parentElement !== editorEl) return
    const blockRect = block.getBoundingClientRect()
    const target =
      scrollEl.scrollTop +
      (blockRect.top - scrollRect.top) -
      scrollRect.height / 2 +
      blockRect.height / 2
    if (Math.abs(scrollEl.scrollTop - target) > 2) {
      scrollEl.scrollTo({ top: target, behavior: 'smooth' })
    }
  }, [editorAreaRef])

  useEffect(() => {
    if (!typewriter) return
    // rAF 节流：连续输入时 selectionchange 高频触发，每帧最多滚动一次
    let raf = 0
    const handler = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(centerCaret)
    }
    document.addEventListener('selectionchange', handler)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('selectionchange', handler)
    }
  }, [typewriter, centerCaret])

  return { centerCaret }
}
