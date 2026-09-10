import { memo } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

import { baseNodeRadius, folderHue } from './graph-visual'
import type { GraphData, GraphDataNode } from './graph-data'
import type { GraphSettings } from './graph-settings'
import type { GraphLayoutController } from './useGraphLayout'
import type { GraphViewTransform, GraphViewportSize } from './useGraphViewport'

interface GraphNodeProps {
  node: GraphDataNode
  radius: number
  folderFill: string | undefined
  showLabel: boolean
  active: boolean
  registerElement: (id: string, element: SVGGElement | null) => void
  onPointerDown: (event: ReactPointerEvent, id: string) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: (event: ReactPointerEvent) => void
  onEnter: (id: string) => void
  onLeave: (id: string) => void
}

const GraphNode = memo(function GraphNode({
  node,
  radius,
  folderFill,
  showLabel,
  active,
  registerElement,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onEnter,
  onLeave,
}: GraphNodeProps): JSX.Element {
  return (
    <g
      ref={(element) => registerElement(node.id, element)}
      className={`graph-node ${node.ghost ? 'ghost' : ''} ${active ? 'active' : ''}`}
      onPointerDown={(event) => onPointerDown(event, node.id)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerEnter={() => onEnter(node.id)}
      onPointerLeave={() => onLeave(node.id)}
    >
      <circle
        r={radius}
        className="graph-node-circle"
        style={folderFill ? { fill: folderFill } : undefined}
      />
      {showLabel && (
        <text className="graph-node-label" y={radius + 13}>
          {node.label}
        </text>
      )}
    </g>
  )
})

interface GraphCanvasProps {
  data: GraphData | null
  settings: GraphSettings
  size: GraphViewportSize
  view: GraphViewTransform
  activePath: string | null
  hovered: string | null
  filterMatches: Set<string> | null
  layout: GraphLayoutController
  svgRef: RefObject<SVGSVGElement>
  transformGroupRef: RefObject<SVGGElement>
  onBackgroundPointerDown: (event: ReactPointerEvent) => void
  onBackgroundPointerMove: (event: ReactPointerEvent) => void
  onBackgroundPointerUp: () => void
  onNodePointerDown: (event: ReactPointerEvent, id: string) => void
  onNodePointerMove: (event: ReactPointerEvent) => void
  onNodePointerUp: (event: ReactPointerEvent) => void
  onNodeEnter: (id: string) => void
  onNodeLeave: (id: string) => void
}

const ARROW_MARKER_ID = 'mkgraph-arrow'

export function GraphCanvas({
  data,
  settings,
  size,
  view,
  activePath,
  hovered,
  filterMatches,
  layout,
  svgRef,
  transformGroupRef,
  onBackgroundPointerDown,
  onBackgroundPointerMove,
  onBackgroundPointerUp,
  onNodePointerDown,
  onNodePointerMove,
  onNodePointerUp,
  onNodeEnter,
  onNodeLeave,
}: GraphCanvasProps): JSX.Element {
  const lowerActivePath = activePath?.toLowerCase() ?? ''
  const labelThreshold = 0.25 + settings.textFade * 0.28
  const zoomShowsLabels = view.scale >= labelThreshold

  return (
    <svg
      ref={svgRef}
      className="graph-canvas"
      width={size.width}
      height={size.height}
      onPointerDown={onBackgroundPointerDown}
      onPointerMove={onBackgroundPointerMove}
      onPointerUp={onBackgroundPointerUp}
      onPointerLeave={onBackgroundPointerUp}
    >
      <defs>
        <marker
          id={ARROW_MARKER_ID}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6.5"
          markerHeight="6.5"
          orient="auto"
        >
          <path d="M0,1 L9,5 L0,9 z" fill="context-stroke" />
        </marker>
      </defs>
      <g
        ref={transformGroupRef}
        transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}
      >
        <g className="graph-edges">
          {data?.links.map((link, index) => (
            <line
              key={`${link.source}-${link.target}-${index}`}
              ref={(element) => {
                layout.edgeElementsRef.current[index] = element
              }}
              className="graph-edge"
              strokeWidth={settings.linkThickness}
              markerEnd={settings.arrows ? `url(#${ARROW_MARKER_ID})` : undefined}
              x1={0}
              y1={0}
              x2={0}
              y2={0}
            />
          ))}
        </g>
        <g className="graph-nodes">
          {data?.nodes.map((node) => {
            const active = Boolean(node.path) && node.id.toLowerCase() === lowerActivePath
            const radius = baseNodeRadius(node.degree) * settings.nodeSize
            const folderFill =
              settings.folderColor && !node.ghost && node.folder
                ? `hsl(${folderHue(node.folder)}, 45%, 52%)`
                : undefined
            const showLabel =
              (node.id === hovered || active || zoomShowsLabels) &&
              !(filterMatches !== null && !filterMatches.has(node.id))
            return (
              <GraphNode
                key={node.id}
                node={node}
                radius={radius}
                folderFill={folderFill}
                showLabel={showLabel}
                active={active}
                registerElement={layout.registerNodeElement}
                onPointerDown={onNodePointerDown}
                onPointerMove={onNodePointerMove}
                onPointerUp={onNodePointerUp}
                onEnter={onNodeEnter}
                onLeave={onNodeLeave}
              />
            )
          })}
        </g>
      </g>
    </svg>
  )
}
