import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'

import { ForceSimulation } from './force'
import { baseNodeRadius, buildGraphAdjacency } from './graph-visual'
import type { ForceNode, ForceParams } from './force'
import type { GraphData } from './graph-data'
import type { GraphSettings } from './graph-settings'
import type { GraphViewportSize } from './useGraphViewport'

const MAX_SIMULATION_FRAMES = 6000

export interface GraphLayoutController {
  simulationRef: MutableRefObject<ForceSimulation | null>
  nodeElementsRef: MutableRefObject<Map<string, SVGGElement>>
  edgeElementsRef: MutableRefObject<(SVGLineElement | null)[]>
  idIndexRef: MutableRefObject<Map<string, number>>
  startLoopRef: MutableRefObject<((animated?: boolean) => void) | null>
  registerNodeElement: (id: string, element: SVGGElement | null) => void
}

interface GraphLayoutOptions {
  active: boolean
  data: GraphData | null
  signature: string
  settings: GraphSettings
  size: GraphViewportSize
  onStructureChange: () => void
}

export function useGraphLayout({
  active,
  data,
  signature,
  settings,
  size,
  onStructureChange,
}: GraphLayoutOptions): GraphLayoutController {
  const simulationRef = useRef<ForceSimulation | null>(null)
  const nodeElementsRef = useRef(new Map<string, SVGGElement>())
  const edgeElementsRef = useRef<(SVGLineElement | null)[]>([])
  const idIndexRef = useRef(new Map<string, number>())
  const startLoopRef = useRef<((animated?: boolean) => void) | null>(null)
  const savedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const previousSignatureRef = useRef('')
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const forceParams: ForceParams = useMemo(
    () => ({
      centerForce: settings.centerForce,
      repelForce: settings.repelForce,
      linkForce: settings.linkForce,
      linkDistance: settings.linkDistance,
      nodeScale: settings.nodeSize,
    }),
    [
      settings.centerForce,
      settings.linkDistance,
      settings.linkForce,
      settings.nodeSize,
      settings.repelForce,
    ],
  )
  const forceParamsRef = useRef(forceParams)
  forceParamsRef.current = forceParams

  useEffect(() => {
    if (!active || !data) {
      previousSignatureRef.current = ''
      return
    }
    const dataChanged = previousSignatureRef.current !== signature
    previousSignatureRef.current = signature
    const idIndex = new Map<string, number>()
    data.nodes.forEach((node, index) => idIndex.set(node.id, index))
    idIndexRef.current = idIndex

    const forceNodes: ForceNode[] = data.nodes.map((node) => ({
      id: node.id,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: baseNodeRadius(node.degree),
    }))
    const forceLinks = data.links.flatMap((link) => {
      const source = idIndex.get(link.source)
      const target = idIndex.get(link.target)
      return source !== undefined && target !== undefined ? [{ source, target }] : []
    })
    const simulation = new ForceSimulation(
      forceNodes,
      forceLinks,
      size.width,
      size.height,
      dataChanged ? undefined : savedPositionsRef.current,
      forceParamsRef.current,
    )
    simulationRef.current = simulation
    if (dataChanged) onStructureChange()
    else simulation.reheat(0.15)

    let animationFrame = 0
    let frames = 0
    const applyPositions = (updateEdges: boolean) => {
      for (const node of forceNodes) {
        nodeElementsRef.current.get(node.id)?.setAttribute(
          'transform',
          `translate(${node.x.toFixed(1)},${node.y.toFixed(1)})`,
        )
      }
      if (!updateEdges) return
      for (let index = 0; index < forceLinks.length; index++) {
        const line = edgeElementsRef.current[index]
        if (!line) continue
        const source = forceNodes[forceLinks[index].source]
        const target = forceNodes[forceLinks[index].target]
        line.setAttribute('x1', source.x.toFixed(1))
        line.setAttribute('y1', source.y.toFixed(1))
        line.setAttribute('x2', target.x.toFixed(1))
        line.setAttribute('y2', target.y.toFixed(1))
      }
    }
    const tick = () => {
      const iterations = frames < 30 ? 4 : 1
      for (let index = 0; index < iterations; index++) simulation.step()
      frames++
      applyPositions(frames % 2 === 0 || !simulation.active)
      if (settingsRef.current.animate && !simulation.active) simulation.reheat(0.028)
      const withinBudget =
        frames < MAX_SIMULATION_FRAMES || settingsRef.current.animate
      if (simulation.active && withinBudget) animationFrame = requestAnimationFrame(tick)
      else applyPositions(true)
    }
    const runLayout = (animated = false) => {
      cancelAnimationFrame(animationFrame)
      if (frames >= MAX_SIMULATION_FRAMES && !settingsRef.current.animate) frames = 0
      if (animated || settingsRef.current.animate) {
        animationFrame = requestAnimationFrame(tick)
        return
      }
      let guard = 0
      while (simulation.active && guard < 800 && frames < MAX_SIMULATION_FRAMES) {
        simulation.step()
        frames++
        guard++
      }
      applyPositions(true)
    }
    startLoopRef.current = runLayout
    runLayout()
    return () => {
      cancelAnimationFrame(animationFrame)
      startLoopRef.current = null
      savedPositionsRef.current = new Map(
        forceNodes.map((node) => [node.id, { x: node.x, y: node.y }]),
      )
      simulationRef.current = null
    }
    // Size and force parameters have dedicated warm-restart effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, signature])

  useEffect(() => {
    const simulation = simulationRef.current
    if (!active || !simulation) return
    simulation.setParams(forceParams)
    simulation.reheat(0.35)
    startLoopRef.current?.()
  }, [active, forceParams])

  useEffect(() => {
    const simulation = simulationRef.current
    if (!active || !simulation) return
    simulation.setSize(size.width, size.height)
    simulation.reheat(0.2)
    startLoopRef.current?.()
  }, [active, size.height, size.width])

  const registerNodeElement = useCallback((id: string, element: SVGGElement | null) => {
    if (element) nodeElementsRef.current.set(id, element)
    else nodeElementsRef.current.delete(id)
  }, [])

  return {
    simulationRef,
    nodeElementsRef,
    edgeElementsRef,
    idIndexRef,
    startLoopRef,
    registerNodeElement,
  }
}

export function useGraphHighlights(
  data: GraphData | null,
  hovered: string | null,
  filterMatches: Set<string> | null,
  layout: GraphLayoutController,
): void {
  const adjacencyRef = useRef<Map<string, Set<string>>>(new Map())

  useEffect(() => {
    adjacencyRef.current = buildGraphAdjacency(data)
  }, [data])

  useEffect(() => {
    const highlighted = new Set<string>()
    if (hovered) {
      highlighted.add(hovered)
      adjacencyRef.current.get(hovered)?.forEach((id) => highlighted.add(id))
    }
    layout.nodeElementsRef.current.forEach((element, id) => {
      const filtered = filterMatches !== null && !filterMatches.has(id)
      element.classList.toggle('filtered', filtered)
      element.classList.toggle(
        'dimmed',
        !filtered && Boolean(hovered) && !highlighted.has(id),
      )
      element.classList.toggle('neighbor', !filtered && highlighted.has(id) && id !== hovered)
    })
    data?.links.forEach((link, index) => {
      const line = layout.edgeElementsRef.current[index]
      if (!line) return
      const filtered =
        filterMatches !== null &&
        (!filterMatches.has(link.source) || !filterMatches.has(link.target))
      line.classList.toggle('filtered', filtered)
      line.classList.toggle('dimmed', !filtered && Boolean(hovered))
    })
  }, [data, filterMatches, hovered, layout.edgeElementsRef, layout.nodeElementsRef])
}
