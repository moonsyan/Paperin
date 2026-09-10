import { useCallback, useMemo, useRef, useState } from 'react'

import { GraphCanvas } from './GraphCanvas'
import { GraphSettingsPanel } from './GraphSettingsPanel'
import { GraphToolbar } from './GraphToolbar'
import { buildGraphData } from './graph-data'
import { DEFAULT_GRAPH_SETTINGS } from './graph-settings'
import { buildGraphStructureSignature, findGraphFilterMatches } from './graph-visual'
import { useGraphHighlights, useGraphLayout } from './useGraphLayout'
import { useGraphNodeInteractions } from './useGraphNodeInteractions'
import { useGraphViewport } from './useGraphViewport'
import type { WorkspaceIndex } from '../../../../shared/workspace-index'
import type { BacklinkGraph } from '../../lib/backlinks'
import type { GraphFilter } from './graph-data'
import type { GraphSettings } from './graph-settings'

interface GraphViewProps {
  active: boolean
  graph: BacklinkGraph | null
  activePath: string | null
  workspaceName: string
  truncated: boolean
  onClose: () => void
  onOpenNode: (path: string) => void
  onGhostClick: (target: string) => void
  settings?: GraphSettings
  onSettingsChange?: (settings: GraphSettings) => void
  graphFilter?: Omit<GraphFilter, 'search' | 'activePath'>
  workspaceIndex?: WorkspaceIndex | null
}

export { DEFAULT_GRAPH_SETTINGS }
export type { GraphSettings }

export function GraphView({
  active,
  graph,
  activePath,
  workspaceName,
  truncated,
  onClose,
  onOpenNode,
  onGhostClick,
  settings,
  onSettingsChange,
  graphFilter,
  workspaceIndex = null,
}: GraphViewProps): JSX.Element | null {
  const currentSettings = settings ?? DEFAULT_GRAPH_SETTINGS
  const activePathRef = useRef(activePath)
  activePathRef.current = activePath
  const settingsRef = useRef(currentSettings)
  settingsRef.current = currentSettings

  // The active path is read from a ref so moving between files only changes the
  // highlight, rather than rebuilding and rearranging the entire workspace graph.
  const data = useMemo(() => {
    const source = workspaceIndex ?? graph
    return source
      ? buildGraphData(
          source,
          {
            ...graphFilter,
            activePath: activePathRef.current,
            search: currentSettings.search,
          },
          {
            maxNodes: currentSettings.maxNodes,
            hideOrphans: !currentSettings.showOrphans,
          },
        )
      : null
  }, [
    currentSettings.maxNodes,
    currentSettings.search,
    currentSettings.showOrphans,
    graph,
    graphFilter,
    workspaceIndex,
  ])
  const signature = useMemo(() => buildGraphStructureSignature(data), [data])
  const filterMatches = useMemo(
    () => findGraphFilterMatches(data, currentSettings.search),
    [currentSettings.search, data],
  )
  const [hovered, setHovered] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const viewport = useGraphViewport(active, onClose)
  const { resetView } = viewport
  const handleStructureChange = useCallback(() => {
    resetView()
    setHovered(null)
  }, [resetView])
  const layout = useGraphLayout({
    active,
    data,
    signature,
    settings: currentSettings,
    size: viewport.size,
    onStructureChange: handleStructureChange,
  })
  const nodeInteractions = useGraphNodeInteractions({
    data,
    svgRef: viewport.svgRef,
    viewRef: viewport.viewRef,
    layout,
    setHovered,
    onOpenNode,
    onGhostClick,
  })
  useGraphHighlights(data, hovered, filterMatches, layout)

  const handleSettingChange = useCallback(
    <Key extends keyof GraphSettings>(key: Key, value: GraphSettings[Key]) => {
      onSettingsChange?.({ ...settingsRef.current, [key]: value })
    },
    [onSettingsChange],
  )
  const handleNodeEnter = useCallback((id: string) => setHovered(id), [])
  const handleNodeLeave = useCallback(
    (id: string) => setHovered((current) => (current === id ? null : current)),
    [],
  )

  if (!active) return null

  const nodeCount = data?.nodes.length ?? 0
  const linkCount = data?.links.length ?? 0
  const ghostCount = data?.nodes.filter((node) => node.ghost).length ?? 0

  return (
    <div className="graph-tab-view" role="tabpanel" aria-label="知识图谱">
      <GraphToolbar
        workspaceName={workspaceName}
        nodeCount={nodeCount}
        linkCount={linkCount}
        ghostCount={ghostCount}
        settingsOpen={settingsOpen}
        onZoomIn={() => viewport.zoomBy(1.25)}
        onZoomOut={() => viewport.zoomBy(0.8)}
        onReset={() => viewport.setView({ tx: 0, ty: 0, scale: 1 })}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onClose={onClose}
      />
      <div className="graph-canvas-wrap" ref={viewport.containerRef}>
        <GraphCanvas
          data={data}
          settings={currentSettings}
          size={viewport.size}
          view={viewport.view}
          activePath={activePath}
          hovered={hovered}
          filterMatches={filterMatches}
          layout={layout}
          svgRef={viewport.svgRef}
          transformGroupRef={viewport.transformGroupRef}
          onBackgroundPointerDown={viewport.handlePointerDown}
          onBackgroundPointerMove={viewport.handlePointerMove}
          onBackgroundPointerUp={viewport.handlePointerUp}
          onNodePointerDown={nodeInteractions.handleNodePointerDown}
          onNodePointerMove={nodeInteractions.handleNodePointerMove}
          onNodePointerUp={nodeInteractions.handleNodePointerUp}
          onNodeEnter={handleNodeEnter}
          onNodeLeave={handleNodeLeave}
        />
        <GraphSettingsPanel
          open={settingsOpen}
          settings={currentSettings}
          onSettingChange={handleSettingChange}
        />
        {(data?.reduced || truncated) && (
          <div className="graph-note">
            工作区规模较大，图谱仅展示连接最多的 {currentSettings.maxNodes}{' '}
            个节点（可在图谱设置调整上限）
          </div>
        )}
        {nodeCount === 0 && (
          <div className="graph-empty">
            暂无链接：用 [[笔记名]] 在文件之间建立链接后，这里会形成知识图谱
          </div>
        )}
        <div className="graph-legend">
          <span className="graph-legend-item">
            <i className="dot file" />笔记
          </span>
          <span className="graph-legend-item">
            <i className="dot ghost" />未解析
          </span>
          <span className="graph-legend-item">
            <i className="dot active" />当前文件
          </span>
          <span className="graph-legend-hint">拖动节点 · 滚轮缩放 · 点击打开</span>
        </div>
      </div>
    </div>
  )
}
