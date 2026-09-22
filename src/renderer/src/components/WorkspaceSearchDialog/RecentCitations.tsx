export function RecentCitations({
  paths,
  onOpen,
  onClear,
  onClearSourceRelations,
}: {
  paths: readonly string[]
  onOpen: (relativePath: string) => void
  onClear: () => void
  onClearSourceRelations?: () => void
}): JSX.Element | null {
  if (paths.length === 0 && !onClearSourceRelations) return null
  return (
    <div className="ws-recent">
      <div className="ws-recent-head">
        <span>最近引用</span>
        <div className="ws-recent-actions">
          <button type="button" className="ws-recent-clear" onClick={onClear}>
            清除导航记录
          </button>
          {onClearSourceRelations && (
            <button type="button" className="ws-recent-clear" onClick={onClearSourceRelations}>
              删除来源关系
            </button>
          )}
        </div>
      </div>
      {paths.length === 0 && (
        <p className="ws-recent-empty">暂无最近引用</p>
      )}
      {paths.map((path) => (
        <button key={path} type="button" className="ws-recent-item" onClick={() => onOpen(path)}>
          {path}
        </button>
      ))}
    </div>
  )
}
