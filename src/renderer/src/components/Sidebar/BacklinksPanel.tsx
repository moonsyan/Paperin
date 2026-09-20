import { useMemo } from 'react'
import { getBacklinks, getOutgoingLinks } from '../../lib/backlinks'
import type { BacklinkEdge, BacklinkGraph } from '../../lib/backlinks'
import type { SidebarViewModel } from './sidebar-view-model'

/* ==================== 反向链接面板（侧栏"链接"Tab） ==================== */

interface BacklinksPanelProps {
  graph: BacklinkGraph | null
  viewModel?: Pick<SidebarViewModel, 'generation' | 'activePath' | 'backlinks' | 'outgoing'> | null
  /** 当前活动文件路径（仅工作区内的磁盘文件参与反链） */
  activeFilePath: string | null
  loading: boolean
  truncated: boolean
  /** 打开链接指向的文件（query 用于接力文档内搜索定位到具体行） */
  onOpenLink: (path: string, query: string) => void
  /** 把这条链接的片段插入当前文章，不打开来源文件。 */
  onInsertCitation?: (path: string, preview: string) => void
  /** 目标未解析时提示 */
  onUnresolvedClick: (target: string) => void
  /** 打开知识图谱视图 */
  onOpenGraph: () => void
}

const displayName = (path: string): string =>
  path.replace(/\\/g, '/').split('/').pop() ?? path

const displayDir = (path: string): string => {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx > 0 ? normalized.slice(0, idx) : ''
}

/**
 * 反链条目显示"来源文件"（谁引用了当前文件），
 * 出链条目显示"目标文件"（当前文件引用了谁，未解析目标以虚样式提示）
 */
const EdgeRow = ({
  edge,
  mode,
  onOpenLink,
  onInsertCitation,
  onUnresolvedClick,
}: {
  edge: BacklinkEdge
  mode: 'source' | 'target'
  onOpenLink: (path: string, query: string) => void
  onInsertCitation?: (path: string, preview: string) => void
  onUnresolvedClick: (target: string) => void
}): JSX.Element => {
  const path = mode === 'source' ? edge.sourcePath : edge.targetPath
  const label = mode === 'source' ? displayName(edge.sourcePath) : edge.targetPath ? displayName(edge.targetPath) : edge.target
  const title = path
    ? `${label}（${displayDir(path)}）`
    : `未解析目标：${edge.target}`
  return (
    <div className="backlink-item">
      <button
        type="button"
        className={`backlink-row ${path ? '' : 'unresolved'}`}
        onClick={() => {
          if (path) onOpenLink(path, edge.alias || edge.target)
          else onUnresolvedClick(edge.target)
        }}
        title={title}
      >
        <span className="backlink-name">{label}</span>
        <span className="backlink-preview">{edge.preview}</span>
      </button>
      {path && onInsertCitation && (
        <button
          type="button"
          className="backlink-insert"
          aria-label={`把「${label}」的片段插入当前文章`}
          onClick={() => onInsertCitation(path, edge.preview)}
        >
          插入引用
        </button>
      )}
    </div>
  )
}

export const BacklinksPanel = ({
  graph,
  viewModel = null,
  activeFilePath,
  loading,
  truncated,
  onOpenLink,
  onInsertCitation,
  onUnresolvedClick,
  onOpenGraph,
}: BacklinksPanelProps): JSX.Element => {
  const backlinks = useMemo(
    () => viewModel ? viewModel.backlinks : getBacklinks(graph, activeFilePath),
    [viewModel, graph, activeFilePath],
  )
  const outgoing = useMemo(
    () => viewModel ? viewModel.outgoing : getOutgoingLinks(graph, activeFilePath),
    [viewModel, graph, activeFilePath],
  )

  return (
    <div className="backlinks-root">
      {!activeFilePath ? (
        <div className="backlinks-empty">
          打开工作区内的文件后，这里会显示引用它的笔记（反向链接）与它发出的链接。每条链接右侧可「插入引用」。
        </div>
      ) : (
        <>
          <div className="backlinks-section">
            <div className="backlinks-heading">
              反向链接
              <span className="backlinks-count">{backlinks.length}</span>
            </div>
            {loading && !graph && <div className="backlinks-empty">正在建立链接索引…</div>}
            {(!loading || graph) && backlinks.length === 0 && (
              <div className="backlinks-empty">没有其他文件链接到这里</div>
            )}
            {backlinks.map((edge, i) => (
              <EdgeRow
                key={`in-${edge.sourcePath}-${edge.line}-${i}`}
                edge={edge}
                mode="source"
                onOpenLink={onOpenLink}
                onInsertCitation={onInsertCitation}
                onUnresolvedClick={onUnresolvedClick}
              />
            ))}
          </div>

          <div className="backlinks-section">
            <div className="backlinks-heading">
              出链
              <span className="backlinks-count">{outgoing.length}</span>
            </div>
            {outgoing.length === 0 && (
              <div className="backlinks-empty">当前文件没有链接到其他笔记</div>
            )}
            {outgoing.map((edge, i) => (
              <EdgeRow
                key={`out-${edge.line}-${edge.target}-${i}`}
                edge={edge}
                mode="target"
                onOpenLink={onOpenLink}
                onInsertCitation={onInsertCitation}
                onUnresolvedClick={onUnresolvedClick}
              />
            ))}
          </div>

          {truncated && (
            <div className="backlinks-note">工作区文件较多，链接索引仅覆盖部分文件</div>
          )}
        </>
      )}
      <button type="button" className="backlinks-graph-btn" onClick={onOpenGraph}>
        打开知识图谱
      </button>
    </div>
  )
}
