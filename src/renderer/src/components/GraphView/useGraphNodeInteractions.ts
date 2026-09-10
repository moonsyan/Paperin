import { useCallback, useRef } from 'react'
import type { Dispatch, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from 'react'

import type { GraphData } from './graph-data'
import type { GraphLayoutController } from './useGraphLayout'
import type { GraphViewTransform } from './useGraphViewport'

interface GraphNodeInteractionOptions {
  data: GraphData | null
  svgRef: RefObject<SVGSVGElement>
  viewRef: RefObject<GraphViewTransform>
  layout: GraphLayoutController
  setHovered: Dispatch<SetStateAction<string | null>>
  onOpenNode: (path: string) => void
  onGhostClick: (target: string) => void
}

interface GraphNodeInteractions {
  handleNodePointerDown: (event: ReactPointerEvent, id: string) => void
  handleNodePointerMove: (event: ReactPointerEvent) => void
  handleNodePointerUp: (event: ReactPointerEvent) => void
}

export function useGraphNodeInteractions({
  data,
  svgRef,
  viewRef,
  layout,
  setHovered,
  onOpenNode,
  onGhostClick,
}: GraphNodeInteractionOptions): GraphNodeInteractions {
  const dragRef = useRef<{ id: string; moved: boolean } | null>(null)

  const toGraphCoordinates = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = svgRef.current?.getBoundingClientRect()
      const view = viewRef.current
      if (!rect || !view) return { x: 0, y: 0 }
      return {
        x: (clientX - rect.left - view.tx) / view.scale,
        y: (clientY - rect.top - view.ty) / view.scale,
      }
    },
    [svgRef, viewRef],
  )

  const handleNodePointerDown = useCallback(
    (event: ReactPointerEvent, id: string) => {
      event.preventDefault()
      event.stopPropagation()
      dragRef.current = { id, moved: false }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setHovered(id)
    },
    [setHovered],
  )

  const handleNodePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const simulation = layout.simulationRef.current
      const index = layout.idIndexRef.current.get(drag.id)
      if (!simulation || index === undefined) return
      const position = toGraphCoordinates(event.clientX, event.clientY)
      const node = simulation.nodes[index]
      if (
        !drag.moved &&
        (Math.abs(node.x - position.x) > 2 || Math.abs(node.y - position.y) > 2)
      ) {
        drag.moved = true
      }
      node.fx = position.x
      node.fy = position.y
      if (!simulation.active) simulation.reheat(0.3)
      layout.startLoopRef.current?.(true)
    },
    [layout.idIndexRef, layout.simulationRef, layout.startLoopRef, toGraphCoordinates],
  )

  const handleNodePointerUp = useCallback(
    (event: ReactPointerEvent) => {
      const drag = dragRef.current
      dragRef.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      if (!drag) return
      const simulation = layout.simulationRef.current
      const index = layout.idIndexRef.current.get(drag.id)
      if (simulation && index !== undefined) {
        simulation.nodes[index].fx = undefined
        simulation.nodes[index].fy = undefined
      }
      if (drag.moved) return
      const target = data?.nodes.find((node) => node.id === drag.id)
      if (!target) return
      if (target.path) onOpenNode(target.path)
      else onGhostClick(target.label)
    },
    [data, layout.idIndexRef, layout.simulationRef, onGhostClick, onOpenNode],
  )

  return { handleNodePointerDown, handleNodePointerMove, handleNodePointerUp }
}
