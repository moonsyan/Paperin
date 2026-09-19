import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from 'react'
import { isImeComposing } from '../../lib/keyboard'

export interface GraphViewportSize {
  width: number
  height: number
}

export interface GraphViewTransform {
  tx: number
  ty: number
  scale: number
}

interface GraphViewportController {
  containerRef: RefObject<HTMLDivElement>
  svgRef: RefObject<SVGSVGElement>
  transformGroupRef: RefObject<SVGGElement>
  size: GraphViewportSize
  view: GraphViewTransform
  viewRef: RefObject<GraphViewTransform>
  setView: Dispatch<SetStateAction<GraphViewTransform>>
  resetView: () => void
  zoomBy: (factor: number) => void
  handlePointerDown: (event: ReactPointerEvent) => void
  handlePointerMove: (event: ReactPointerEvent) => void
  handlePointerUp: () => void
}

const DEFAULT_VIEW: GraphViewTransform = { tx: 0, ty: 0, scale: 1 }

export function useGraphViewport(active: boolean, onClose: () => void): GraphViewportController {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const transformGroupRef = useRef<SVGGElement>(null)
  const [size, setSize] = useState<GraphViewportSize>({ width: 800, height: 560 })
  // Gesture updates bypass React so a large SVG does not re-render on every pointer move.
  const [view, setView] = useState<GraphViewTransform>(DEFAULT_VIEW)
  const viewRef = useRef(view)
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const applyViewTransform = useCallback(() => {
    const current = viewRef.current
    transformGroupRef.current?.setAttribute(
      'transform',
      `translate(${current.tx},${current.ty}) scale(${current.scale})`,
    )
  }, [])

  const resetView = useCallback(() => {
    viewRef.current = DEFAULT_VIEW
    setView(DEFAULT_VIEW)
  }, [])

  useEffect(() => {
    if (!active) return
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      setSize((previous) =>
        Math.abs(previous.width - rect.width) < 1 &&
        Math.abs(previous.height - rect.height) < 1
          ? previous
          : { width: rect.width, height: rect.height },
      )
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [active])

  useEffect(() => {
    if (!active) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isImeComposing(event)) return
      if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement)) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active, onClose])

  useEffect(() => {
    if (!active) return
    const svg = svgRef.current
    if (!svg) return
    let syncTimer: ReturnType<typeof setTimeout> | null = null
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      const current = viewRef.current
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
      const scale = Math.min(3, Math.max(0.25, current.scale * factor))
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      viewRef.current = {
        tx: pointerX - ((pointerX - current.tx) / current.scale) * scale,
        ty: pointerY - ((pointerY - current.ty) / current.scale) * scale,
        scale,
      }
      applyViewTransform()
      if (syncTimer) clearTimeout(syncTimer)
      syncTimer = setTimeout(() => setView({ ...viewRef.current }), 180)
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      svg.removeEventListener('wheel', handleWheel)
      if (syncTimer) clearTimeout(syncTimer)
    }
  }, [active, applyViewTransform])

  const handlePointerDown = useCallback((event: ReactPointerEvent) => {
    const current = viewRef.current
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      tx: current.tx,
      ty: current.ty,
    }
  }, [])

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const pan = panRef.current
      if (!pan) return
      viewRef.current = {
        ...viewRef.current,
        tx: pan.tx + (event.clientX - pan.x),
        ty: pan.ty + (event.clientY - pan.y),
      }
      applyViewTransform()
    },
    [applyViewTransform],
  )

  const handlePointerUp = useCallback(() => {
    if (!panRef.current) return
    panRef.current = null
    setView({ ...viewRef.current })
  }, [])

  const zoomBy = useCallback(
    (factor: number) => {
      const current = viewRef.current
      const scale = Math.min(3, Math.max(0.25, current.scale * factor))
      const centerX = size.width / 2
      const centerY = size.height / 2
      viewRef.current = {
        tx: centerX - ((centerX - current.tx) / current.scale) * scale,
        ty: centerY - ((centerY - current.ty) / current.scale) * scale,
        scale,
      }
      applyViewTransform()
      setView({ ...viewRef.current })
    },
    [applyViewTransform, size.height, size.width],
  )

  return {
    containerRef,
    svgRef,
    transformGroupRef,
    size,
    view,
    viewRef,
    setView,
    resetView,
    zoomBy,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  }
}
