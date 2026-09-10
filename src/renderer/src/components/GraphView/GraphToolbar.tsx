interface GraphToolbarProps {
  workspaceName: string
  nodeCount: number
  linkCount: number
  ghostCount: number
  settingsOpen: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  onToggleSettings: () => void
  onClose: () => void
}

export function GraphToolbar({
  workspaceName,
  nodeCount,
  linkCount,
  ghostCount,
  settingsOpen,
  onZoomIn,
  onZoomOut,
  onReset,
  onToggleSettings,
  onClose,
}: GraphToolbarProps): JSX.Element {
  return (
    <div className="graph-tab-toolbar">
      <div className="graph-tab-title">
        知识图谱
        <span className="graph-tab-sub">
          {workspaceName} · {nodeCount} 个笔记 · {linkCount} 条链接
          {ghostCount > 0 ? ` · ${ghostCount} 个未解析` : ''}
        </span>
      </div>
      <div className="graph-tab-actions">
        <button type="button" className="graph-zoom-btn" onClick={onZoomIn} aria-label="放大">
          +
        </button>
        <button type="button" className="graph-zoom-btn" onClick={onZoomOut} aria-label="缩小">
          −
        </button>
        <button type="button" className="graph-zoom-btn" onClick={onReset} aria-label="重置视图">
          重置
        </button>
        <button
          type="button"
          className={`graph-zoom-btn ${settingsOpen ? 'active' : ''}`}
          onClick={onToggleSettings}
          aria-label="图谱设置"
          aria-pressed={settingsOpen}
          title="设置"
        >
          ⚙
        </button>
        <button
          type="button"
          className="graph-close-btn"
          onClick={onClose}
          aria-label="关闭知识图谱标签"
          title="关闭标签（Esc）"
        >
          ×
        </button>
      </div>
    </div>
  )
}
