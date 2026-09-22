import { useEffect, useRef, useState } from 'react'
import type { WorkspaceIndex } from '../../../../shared/workspace-index'
import type { WorkspaceCoverage } from '../../../../shared/workspace-coverage'
import { workspaceCoverageLegacyFlags } from '../../../../shared/workspace-coverage'
import { searchStructuredIndex } from '../../lib/diagnostics'
import { rankSearchMatches } from '../../lib/search-rank'

const MAX_SEARCH_QUERY_LENGTH = 256

export interface WorkspaceSearchMatch {
  path: string
  line: number
  preview: string
  generation?: number
}

export interface SearchCoverage {
  truncated: boolean
  scanTruncated?: boolean
  matchCapped?: boolean
  coverage?: WorkspaceCoverage
}

export function useWorkspaceSearch({
  open,
  workspacePath,
  workspaceIndex,
  initialQuery,
  onQueryCommit,
}: {
  open: boolean
  workspacePath: string
  workspaceIndex: WorkspaceIndex | null
  initialQuery: string
  onQueryCommit?: (query: string) => void
}) {
  const [query, setQuery] = useState(initialQuery.slice(0, MAX_SEARCH_QUERY_LENGTH))
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [error, setError] = useState('')
  const [matches, setMatches] = useState<WorkspaceSearchMatch[]>([])
  const [coverage, setCoverage] = useState<SearchCoverage>({ truncated: false })
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchSeqRef = useRef(0)

  useEffect(() => {
    searchSeqRef.current += 1
    const cancelSeq = searchSeqRef.current
    if (!open) {
      setLoading(false)
      setMatches([])
      setCoverage({ truncated: false })
      setError('')
      setSearched(false)
      if (window.desktopAPI?.workspace) {
        void window.desktopAPI.workspace.search(workspacePath, '', false, false, {
          cancel: true,
          queryId: cancelSeq,
        })
      }
      return
    }
    setMatches([])
    setCoverage({ truncated: false })
    setError('')
    setSearched(false)
    inputRef.current?.focus()
  }, [open, workspacePath, workspaceIndex?.generation])

  const doSearch = async () => {
    const q = query.trim()
    if (!q) {
      searchSeqRef.current += 1
      setMatches([])
      setCoverage({ truncated: false })
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
    onQueryCommit?.(q)
    setMatches([])
    setCoverage({ truncated: false })
    setLoading(true)
    setSearched(true)
    setError('')
    let seq = 0
    try {
      const isStructured = /(?:^|\s)(?:tag|path|link|is|has):/.test(q)
      const previousSeq = searchSeqRef.current
      seq = ++searchSeqRef.current
      if (isStructured) {
        if (!workspaceIndex) {
          setError('索引未完成，请先重新扫描')
          return
        }
        const structuredMatches = searchStructuredIndex(workspaceIndex, q)
        if (seq !== searchSeqRef.current) return
        setMatches(rankSearchMatches(
          structuredMatches.map(({ path, line, preview, generation }) => ({ path, line, preview, generation })),
          q,
        ))
        const indexCoverage = workspaceIndex.coverage
        setCoverage({
          coverage: indexCoverage,
          ...workspaceCoverageLegacyFlags(indexCoverage),
        })
        return
      }
      if (previousSeq > 0) {
        void window.desktopAPI.workspace.search(workspacePath, '', false, false, {
          cancel: true,
          queryId: previousSeq,
        })
      }
      const res = await window.desktopAPI.workspace.search(workspacePath, q, caseSensitive, useRegex, {
        queryId: seq,
      })
      if (seq !== searchSeqRef.current) return
      if (res.ok && res.data) {
        setMatches(useRegex ? res.data.matches : rankSearchMatches(res.data.matches, q))
        setCoverage({
          coverage: res.data.coverage,
          truncated: res.data.truncated,
          scanTruncated: res.data.scanTruncated,
          matchCapped: res.data.matchCapped,
        })
      } else {
        if (res.error?.code === 'CANCELLED') return
        setMatches([])
        setCoverage({ truncated: false })
        if (res.error?.code === 'INVALID_REGEX') setError('正则表达式不合法，请检查后重试')
        else if (res.error?.code === 'REGEX_TIMEOUT') setError(res.error.message ?? '正则表达式匹配超时，请简化表达式')
        else if (res.error?.code === 'QUERY_TOO_LONG') setError(res.error.message ?? '搜索关键词不能超过 256 个字符')
        else setError(res.error?.message ?? '搜索失败，请稍后重试')
      }
    } catch (caught) {
      if (seq === searchSeqRef.current) {
        setMatches([])
        setCoverage({ truncated: false })
        setError(caught instanceof Error ? caught.message : '搜索失败，请稍后重试')
      }
    } finally {
      if (seq === searchSeqRef.current) setLoading(false)
    }
  }

  return {
    query,
    setQuery,
    caseSensitive,
    setCaseSensitive,
    useRegex,
    setUseRegex,
    error,
    matches,
    coverage,
    loading,
    searched,
    inputRef,
    doSearch,
  }
}
