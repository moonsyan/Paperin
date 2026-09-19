export function RecentCitations({
  paths,
  onOpen,
  onClear,
}: {
  paths: readonly string[]
  onOpen: (relativePath: string) => void
  onClear: () => void
}): JSX.Element | null {
  if (paths.length === 0) return null
  return (
    <div className="ws-recent">
      <div className="ws-recent-head">
        <span>最近引用</span>
        <button type="button" className="ws-recent-clear" onClick={onClear}>
          清除导航记录
        </button>
      </div>
      {paths.map((path) => (
        <button key={path} type="button" className="ws-recent-item" onClick={() => onOpen(path)}>
          {path}
        </button>
      ))}
    </div>
  )
}
