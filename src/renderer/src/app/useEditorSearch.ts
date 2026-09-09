import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { setSearchHitsListener } from '../components/Editor/plugins/searchHighlight'
import type { EditorHandle } from '../components/Editor'

/** 持久化搜索状态（U4：重新打开搜索栏时保留查询词/选项/替换文本） */
export interface SearchPreference {
  query: string
  useRegex: boolean
  caseSensitive: boolean
  wholeWord: boolean
  replacement: string
}

const EMPTY_SEARCH_PREF: SearchPreference = {
  query: '',
  useRegex: false,
  caseSensitive: false,
  wholeWord: false,
  replacement: '',
}

export interface UseEditorSearchOptions {
  editorRef: MutableRefObject<EditorHandle | null>
}

/** 查找替换状态与处理器。从 App.tsx 原样迁移，行为保持不变。
 *  关闭搜索栏后的编辑器聚焦由调用方在包装的 closeSearch 中处理。 */
export function useEditorSearch({ editorRef }: UseEditorSearchOptions) {
  const [searchMode, setSearchMode] = useState<'none' | 'find' | 'replace'>('none')
  const [searchCount, setSearchCount] = useState(0)
  const [searchCurrent, setSearchCurrent] = useState(-1)
  const [searchPref, setSearchPref] = useState<SearchPreference>(EMPTY_SEARCH_PREF)
  /** 搜索栏强制重挂载计数（工作区搜索结果带入时，确保查询词重新生效） */
  const [searchEpoch, setSearchEpoch] = useState(0)

  const handleSearchQuery = useCallback(
    (q: string, regex: boolean, caseSensitive: boolean, wholeWord: boolean) => {
      const info =
        editorRef.current?.startSearch(q, regex, caseSensitive, wholeWord) ?? {
          count: 0,
          current: -1,
        }
      setSearchCount(info.count)
      setSearchCurrent(info.current)
      // U4：同步持久化搜索选项
      setSearchPref((prev) =>
        prev.query === q &&
        prev.useRegex === regex &&
        prev.caseSensitive === caseSensitive &&
        prev.wholeWord === wholeWord
          ? prev
          : { ...prev, query: q, useRegex: regex, caseSensitive, wholeWord },
      )
    },
    [editorRef],
  )

  /** U4：替换文本变化时同步到持久化状态 */
  const handleSearchReplacementChange = useCallback((r: string) => {
    setSearchPref((prev) => (prev.replacement === r ? prev : { ...prev, replacement: r }))
  }, [])

  const handleSearchNext = useCallback((backwards: boolean) => {
    setSearchCurrent(editorRef.current?.searchNext(backwards) ?? -1)
  }, [editorRef])

  const handleSearchReplace = useCallback((replacement: string) => {
    const info = editorRef.current?.replaceCurrent(replacement) ?? {
      count: 0,
      current: -1,
    }
    setSearchCount(info.count)
    setSearchCurrent(info.current)
  }, [editorRef])

  const handleSearchReplaceAll = useCallback((replacement: string) => {
    editorRef.current?.replaceAllMatches(replacement)
    setSearchCount(0)
    setSearchCurrent(-1)
  }, [editorRef])

  const closeSearch = useCallback(() => {
    editorRef.current?.endSearch()
    setSearchMode('none')
    setSearchCount(0)
    setSearchCurrent(-1)
  }, [editorRef])

  // D1：搜索栏打开期间订阅编辑后命中变化（插件在 docChanged 后重映射 hits），
  // 计数与高亮保持同步（此前编辑文档后计数停滞在旧值）
  useEffect(() => {
    if (searchMode === 'none') {
      setSearchHitsListener(null)
      return
    }
    setSearchHitsListener((hits, current) => {
      setSearchCount(hits.length)
      setSearchCurrent(current)
    })
    return () => setSearchHitsListener(null)
  }, [searchMode])

  return {
    searchMode,
    setSearchMode,
    searchCount,
    setSearchCount,
    searchCurrent,
    setSearchCurrent,
    searchPref,
    setSearchPref,
    searchEpoch,
    setSearchEpoch,
    closeSearch,
    handlers: {
      onQueryChange: handleSearchQuery,
      onNext: handleSearchNext,
      onReplace: handleSearchReplace,
      onReplaceAll: handleSearchReplaceAll,
      onReplacementChange: handleSearchReplacementChange,
    },
  }
}

export type SearchBarHandlers = ReturnType<typeof useEditorSearch>['handlers']
export type SetSearchMode = Dispatch<SetStateAction<'none' | 'find' | 'replace'>>
