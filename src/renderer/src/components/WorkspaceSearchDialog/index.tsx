import { useState, useRef, useEffect } from 'react'
import { isImeComposing } from '../../lib/keyboard'
import type { WorkspaceIndex } from '../../../../shared/workspace-index'
import { searchStructuredIndex } from '../../lib/diagnostics'

const MAX_SEARCH_QUERY_LENGTH = 256

/** 工作区搜索命中项 */
interface WsMatch {
  path: string
  line: number
  preview: string
  generation?: number
}

/**
 * 预览文本中高亮首个匹配片段（子串/正则）；
 * 无法定位时原样返回，不影响展示。
 */
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
}

/**
 * 工作区全文搜索（基础版）：跨文件逐行子串匹配，
 * 点击结果打开文件并在文档内继续定位。
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
}: WorkspaceSearchDialogProps): JSX.Element | null {
  const capturedFileId = useRef(activeFileId).current
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [error, setError] = useState('')
  const [matches, setMatches] = useState<WsMatch[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // 请求序号：连续搜索时只采纳最后一次结果，避免后发先至旧结果覆盖新结果
  const searchSeqRef = useRef(0)

  useEffect(() => {
    // 关闭或切换工作区时作废进行中的请求，避免旧搜索结果重新显示。
    searchSeqRef.current += 1
    if (!open) {
      setLoading(false)
      setMatches([])
      setTruncated(false)
      setError('')
      setSearched(false)
      return
    }
    setMatches([])
    setTruncated(false)
    setError('')
    setSearched(false)
    inputRef.current?.focus()
  }, [open, workspacePath, workspaceIndex?.generation])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (isImeComposing(e)) return
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const doSearch = async () => {
    const q = query.trim()
    if (!q) {
      searchSeqRef.current += 1
      setMatches([])
      setTruncated(false)
      setError('')
      setLoading(false)
      setSearched(false)
      return
    }
    if (!window.desktopAPI) {
      setError('当前环境不支持工作区搜索')
      return
    }
    if (q.length > MAX_SEARCH_QUERY_LENGTH) {
      setError('搜索关键词不能超过 256 个字符')
      return
    }
    const seq = ++searchSeqRef.current
    // 新搜索开始即清空旧结果：失败/提前返回/搜索中都不再显示上一次的结果
    setMatches([])
    setTruncated(false)
    setLoading(true)
    setSearched(true)
    setError('')
    try {
      const isStructured = /(?:^|\s)(?:tag|path|link|is|has):/.test(q)
      if (isStructured) {
        if (!workspaceIndex) {
          setError('索引未完成，请先重新扫描')
          return
        }
        const structuredMatches = searchStructuredIndex(workspaceIndex, q)
        if (seq !== searchSeqRef.current) return
        setMatches(structuredMatches.map(({ path, line, preview, generation }) => ({ path, line, preview, generation })))
        setTruncated(!workspaceIndex.complete || workspaceIndex.truncated)
        return
      }
      const res = await window.desktopAPI.workspace.search(
        workspacePath,
        q,
        caseSensitive,
        useRegex,
      )
      if (seq !== searchSeqRef.current) return // 已有更新的搜索，丢弃本次结果
      if (res.ok && res.data) {
        setMatches(res.data.matches)
        setTruncated(res.data.truncated)
      } else {
        setMatches([])
        setTruncated(false)
        if (res.error?.code === 'INVALID_REGEX') {
          setError('正则表达式不合法，请检查后重试')
        } else if (res.error?.code === 'REGEX_TIMEOUT') {
          setError(res.error.message ?? '正则表达式匹配超时，请简化表达式')
        } else if (res.error?.code === 'QUERY_TOO_LONG') {
          setError(res.error.message ?? '搜索关键词不能超过 256 个字符')
        } else {
          setError(res.error?.message ?? '搜索失败，请稍后重试')
        }
      }
    } catch (error) {
      if (seq === searchSeqRef.current) {
        setMatches([])
        setTruncated(false)
        setError(error instanceof Error ? error.message : '搜索失败，请稍后重试')
      }
    } finally {
      if (seq === searchSeqRef.current) setLoading(false)
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog ws-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <span className="help-title">在工作区中搜索 · {workspaceName}</span>
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
              className={`search-regex ${useRegex ? 'on' : ''}`}
              onClick={() => setUseRegex((v) => !v)}
              title={useRegex ? '正则模式：开' : '正则模式：关'}
              aria-label="切换正则搜索"
              aria-pressed={useRegex}
            >
              .*
            </button>
            <button
              type="button"
              className={`search-regex ${caseSensitive ? 'on' : ''}`}
              onClick={() => setCaseSensitive((v) => !v)}
              title={caseSensitive ? '区分大小写：开' : '区分大小写：关'}
              aria-label="切换区分大小写"
              aria-pressed={caseSensitive}
            >
              Aa
            </button>
            <input
              ref={inputRef}
              className="search-input ws-input"
              placeholder="输入关键词，回车搜索全部 .md 文件"
              value={query}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (isImeComposing(e.nativeEvent)) return
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void doSearch()
                }
              }}
            />
            <button type="button" className="dialog-btn" onClick={() => void doSearch()}>
              搜索
            </button>
          </div>
          {error && <div className="ws-error">{error}</div>}
          <div className="ws-results">
            {loading && <div className="ws-empty">搜索中…</div>}
            {/* D6：搜索失败（错误横幅已展示）时不再显示"无匹配结果"，避免双重提示 */}
            {!loading && !error && searched && matches.length === 0 && (
              <div className="ws-empty">无匹配结果</div>
            )}
            {!loading &&
              matches.map((m, i) => (
                <div
                  key={`${m.path}-${m.line}-${i}`}
                  className="ws-result-item"
                  title={m.path}
                >
                  <button
                    type="button"
                    className="ws-result-open"
                    onClick={() => {
                      if (m.generation !== undefined && workspaceIndex && m.generation !== workspaceIndex.generation) return
                      onSelect(m.path, m.generation === undefined ? query.trim() : '', { caseSensitive, useRegex })
                    }}
                  >
                    <div className="ws-result-loc">
                      {m.path.split(/[\\/]/).pop()}
                      <span className="ws-result-line"> : {m.line}</span>
                    </div>
                    <div className="ws-result-preview">
                      {renderHighlightedPreview(m.preview, query.trim(), caseSensitive, useRegex)}
                    </div>
                  </button>
                  {onInsertCitation && (
                    <button
                      type="button"
                      className="ws-result-insert"
                      aria-label={`把「${m.path.split(/[\\/]/).pop() ?? '来源'}」的片段插入当前文章`}
                      onClick={() => onInsertCitation({ path: m.path, preview: m.preview, capturedFileId })}
                    >
                      插入引用
                    </button>
                  )}
                </div>
              ))}
            {truncated && (
              <div className="ws-empty">结果过多，仅显示前 200 条</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
