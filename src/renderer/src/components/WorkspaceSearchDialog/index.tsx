import { useRef } from 'react'
import { isImeComposing } from '../../lib/keyboard'
import { useModalDialogKeyboard } from '../../hooks/useModalDialogKeyboard'
import type { WorkspaceIndex } from '../../../../shared/workspace-index'
import { SEARCH_SCOPE_LABEL, searchCoverageNotes } from '../../lib/search-rank'
import { SearchResultList } from './SearchResultList'
import { RecentCitations } from './RecentCitations'
import { useWorkspaceSearch } from './useWorkspaceSearch'

interface WorkspaceSearchDialogProps {
  open: boolean
  /** 工作区根目录 */
  workspacePath: string
  /** 工作区名（标题展示） */
  workspaceName: string
  workspaceIndex?: WorkspaceIndex | null
  onClose: () => void
  /** 点击结果：打开对应文件（并把查询词带入文档内搜索） */
  onSelect: (path: string, query: string, opts?: { caseSensitive: boolean; useRegex: boolean }) => void
  /** 把命中片段作为来源快照插入当前文章；不打开、不修改来源文件。 */
  onInsertCitation?: (match: { path: string; preview: string; capturedFileId: string }) => void
  /** 打开搜索时的活动文档。组件随对话框挂载，用来拒绝把旧结果插入后来换成的文章。 */
  activeFileId?: string
  /** 上次搜索词。对话框随打开重新挂载，只在挂载时填入。 */
  initialQuery?: string
  /** 用户执行搜索后记住查询词，不保存正文。 */
  onQueryCommit?: (query: string) => void
  /** 最近引用的库内相对路径。只作入口，不自动打开。 */
  recentCitations?: readonly string[]
  onOpenRecent?: (relativePath: string) => void
  onClearNavigation?: () => void
}

/**
 * 工作区全文搜索：跨文件逐行匹配，点击结果打开文件并在文档内继续定位。
 */
export function WorkspaceSearchDialog({
  open,
  workspacePath,
  workspaceName,
  workspaceIndex = null,
  onClose,
  onSelect,
  onInsertCitation,
  activeFileId = '',
  initialQuery = '',
  onQueryCommit,
  recentCitations = [],
  onOpenRecent,
  onClearNavigation,
}: WorkspaceSearchDialogProps): JSX.Element | null {
  const capturedFileId = useRef(activeFileId).current
  const dialogRef = useRef<HTMLDivElement>(null)
  const search = useWorkspaceSearch({
    open,
    workspacePath,
    workspaceIndex,
    initialQuery,
    onQueryCommit,
  })

  useModalDialogKeyboard({
    open,
    onClose,
    dialogRef,
    initialFocusRef: search.inputRef,
  })

  if (!open) return null
  const dialogTitleId = 'workspace-search-dialog-title'
  const coverageNotes = searchCoverageNotes({ ...search.coverage, matchCount: search.matches.length })

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog ws-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="help-header">
          <span id={dialogTitleId} className="help-title">
            在工作区中搜索 · {workspaceName}
          </span>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="关闭" title="关闭">
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="ws-dialog-body">
          <div className="ws-search-row">
            <button
              type="button"
              className={`search-regex ${search.useRegex ? 'on' : ''}`}
              onClick={() => search.setUseRegex((value) => !value)}
              title={search.useRegex ? '正则模式：开' : '正则模式：关'}
              aria-label="切换正则搜索"
              aria-pressed={search.useRegex}
            >
              .*
            </button>
            <button
              type="button"
              className={`search-regex ${search.caseSensitive ? 'on' : ''}`}
              onClick={() => search.setCaseSensitive((value) => !value)}
              title={search.caseSensitive ? '区分大小写：开' : '区分大小写：关'}
              aria-label="切换区分大小写"
              aria-pressed={search.caseSensitive}
            >
              Aa
            </button>
            <input
              ref={search.inputRef}
              className="search-input ws-input"
              aria-label="工作区搜索关键词"
              placeholder="输入关键词，回车搜索全部 .md 文件"
              value={search.query}
              spellCheck={false}
              onChange={(event) => search.setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (isImeComposing(event.nativeEvent)) return
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void search.doSearch()
                }
              }}
            />
            <button type="button" className="dialog-btn" onClick={() => void search.doSearch()}>
              搜索
            </button>
          </div>
          <p className="ws-scope">{SEARCH_SCOPE_LABEL}</p>
          {onInsertCitation && (
            <p className="ws-citation-hint">命中右侧可「插入引用」；侧栏「关系」里的反链也有同样操作，可用撤销收回。</p>
          )}
          {!search.searched && onOpenRecent && onClearNavigation && (
            <RecentCitations
              paths={recentCitations}
              onOpen={onOpenRecent}
              onClear={() => {
                search.setQuery('')
                onClearNavigation()
              }}
            />
          )}
          {search.error && <div className="ws-error">{search.error}</div>}
          <SearchResultList
            loading={search.loading}
            error={search.error}
            searched={search.searched}
            matches={search.matches}
            coverageNotes={coverageNotes}
            query={search.query}
            caseSensitive={search.caseSensitive}
            useRegex={search.useRegex}
            workspaceIndex={workspaceIndex}
            capturedFileId={capturedFileId}
            onSelect={onSelect}
            onInsertCitation={onInsertCitation}
          />
        </div>
      </div>
    </div>
  )
}
