import type { WorkspaceIndex } from '../../../../shared/workspace-index'
import { formatSearchResultPath, searchEmptyMessage } from '../../lib/search-rank'

export interface SearchResultMatch {
  path: string
  line: number
  preview: string
  generation?: number
}

function renderHighlightedPreview(
  preview: string,
  query: string,
  caseSensitive: boolean,
  useRegex: boolean,
): JSX.Element | string {
  try {
    let idx = -1
    let len = query.length
    if (useRegex) {
      const re = new RegExp(query, caseSensitive ? '' : 'i')
      const m = re.exec(preview)
      if (m && m[0].length > 0) {
        idx = m.index
        len = m[0].length
      }
    } else {
      idx = caseSensitive
        ? preview.indexOf(query)
        : preview.toLowerCase().indexOf(query.toLowerCase())
    }
    if (idx < 0) return preview
    return (
      <>
        {preview.slice(0, idx)}
        <mark className="ws-match">{preview.slice(idx, idx + len)}</mark>
        {preview.slice(idx + len)}
      </>
    )
  } catch {
    return preview
  }
}

export function SearchResultList({
  loading,
  error,
  searched,
  matches,
  coverageNotes,
  query,
  caseSensitive,
  useRegex,
  workspaceIndex,
  capturedFileId,
  onSelect,
  onInsertCitation,
}: {
  loading: boolean
  error: string
  searched: boolean
  matches: SearchResultMatch[]
  coverageNotes: string[]
  query: string
  caseSensitive: boolean
  useRegex: boolean
  workspaceIndex: WorkspaceIndex | null
  capturedFileId: string
  onSelect: (path: string, query: string, opts?: { caseSensitive: boolean; useRegex: boolean }) => void
  onInsertCitation?: (match: { path: string; preview: string; capturedFileId: string }) => void
}): JSX.Element {
  const trimmed = query.trim()
  return (
    <div className="ws-results">
      {loading && <div className="ws-empty">搜索中…</div>}
      {!loading && !error && searched && matches.length === 0 && (
        <div className="ws-empty">{searchEmptyMessage(coverageNotes)}</div>
      )}
      {!loading && matches.map((match, index) => (
        <div key={`${match.path}-${match.line}-${index}`} className="ws-result-item" title={match.path}>
          <button
            type="button"
            className="ws-result-open"
            onClick={() => {
              if (match.generation !== undefined && workspaceIndex && match.generation !== workspaceIndex.generation) return
              onSelect(match.path, match.generation === undefined ? trimmed : '', { caseSensitive, useRegex })
            }}
          >
            <div className="ws-result-loc">
              {formatSearchResultPath(match.path)}
              <span className="ws-result-line"> : {match.line}</span>
            </div>
            <div className="ws-result-preview">
              {renderHighlightedPreview(match.preview, trimmed, caseSensitive, useRegex)}
            </div>
          </button>
          {onInsertCitation && (
            <button
              type="button"
              className="ws-result-insert"
              aria-label={`把「${match.path.split(/[\\/]/).pop() ?? '来源'}」的片段插入当前文章`}
              onClick={() => onInsertCitation({ path: match.path, preview: match.preview, capturedFileId })}
            >
              插入引用
            </button>
          )}
        </div>
      ))}
      {coverageNotes.map((note) => (
        <div key={note} className="ws-empty">{note}</div>
      ))}
    </div>
  )
}
