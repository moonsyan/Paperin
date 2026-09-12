import { useCallback, useMemo, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { buildSearchPreferencePatch } from './workspace-view-model'
import type { RevealRequest, WorkspaceViewModel } from './workspace-view-model'
import type { SearchPreference } from '../useEditorSearch'

/**
 * 工作区视图模型的应用层装配。
 *
 * 单一 `selectSeqRef` 统一所有「打开文件并接力定位」入口的并发语义：
 * 反链/出链跳转、工作区搜索结果、知识图谱节点、质量诊断跳转共用同一次
 * 「最后一次点选获胜」判定，不再各写一套守卫。
 */

export interface UseWorkspaceViewModelOptions {
  handleSelectWorkspaceFile: (path: string, pinned?: boolean) => Promise<boolean>
  setSearchMode: (mode: 'none' | 'find' | 'replace') => void
  setSearchPref: Dispatch<SetStateAction<SearchPreference>>
  setSearchEpoch: Dispatch<SetStateAction<number>>
  /** 把光标定位到指定行（1 起）；缺省时忽略请求里的 focusLine */
  focusEditorLine?: (line: number) => void
}

export function useWorkspaceViewModel({
  handleSelectWorkspaceFile,
  setSearchMode,
  setSearchPref,
  setSearchEpoch,
  focusEditorLine,
}: UseWorkspaceViewModelOptions): WorkspaceViewModel {
  const selectSeqRef = useRef(0)

  const reveal = useCallback(
    async (request: RevealRequest): Promise<boolean> => {
      const seq = ++selectSeqRef.current
      const opened = await handleSelectWorkspaceFile(request.path, request.pinned)
      // 并发点选只保留最后一次：旧请求迟到返回时不得覆盖新选择
      if (seq !== selectSeqRef.current || !opened) return false

      const followUp = request.search
      if (followUp?.query) {
        setSearchPref((prev) => buildSearchPreferencePatch(prev, followUp))
        setSearchEpoch((e) => e + 1)
        if (followUp.openFindBar) setSearchMode('find')
      }
      if (request.focusLine != null) focusEditorLine?.(request.focusLine)
      return true
    },
    [focusEditorLine, handleSelectWorkspaceFile, setSearchEpoch, setSearchMode, setSearchPref],
  )

  return useMemo(() => ({ reveal }), [reveal])
}
