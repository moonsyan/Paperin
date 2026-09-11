import { useMemo, useCallback } from 'react'
import { useDeferredValue } from 'react'
import { estimateReadMinutes } from '../lib/stats'
import { computeSectionStats, goalProgress } from '../lib/section-stats'
import { useWritingStats } from '../hooks/useWritingStats'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseWritingMetricsOptions {
  activeFileId: string
  activeContent: string
  settingsReady: boolean
  wordGoal: number | null
  wordGoalOverrides: Record<string, number | null>
  setWordGoalOverrides: (updater: (prev: Record<string, number | null>) => Record<string, number | null>) => void
  activeFileIdRef: { current: string }
}

export interface UseWritingMetricsResult {
  wordCount: number
  lineCount: number
  readTime: number
  currentSectionWords: number | undefined
  effectiveGoal: number | null
  goalPercent: number | null
  handleGoalChange: (value: number | undefined) => void
  writingStats: ReturnType<typeof useWritingStats>['writingStats']
  setWritingStats: ReturnType<typeof useWritingStats>['setWritingStats']
  /** 光标所在章节的字数（由 cursorPos.headingIndex 驱动） */
  sectionStatsForIndex: (headingIndex: number) => number | undefined
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 写作统计与字数目标：从文档内容派生字数、行数、阅读时长、章节统计和目标进度。
 *
 * 职责边界：
 * - 使用 useDeferredValue 避免逐键全量重算
 * - 剥离 frontmatter 和 Markdown 标记后统计纯文本
 * - 管理字数目标的全局默认值和按文档覆盖值
 * - 持久化写作统计（通过 useWritingStats）
 *
 * 不包含：光标位置跟踪（由调用方提供 headingIndex）
 */
export function useWritingMetrics({
  activeFileId,
  activeContent,
  settingsReady,
  wordGoal,
  wordGoalOverrides,
  setWordGoalOverrides,
  activeFileIdRef,
}: UseWritingMetricsOptions): UseWritingMetricsResult {
  const statsSource = useMemo(
    () => ({ fileId: activeFileId, content: activeContent }),
    [activeFileId, activeContent],
  )
  const deferredStatsSource = useDeferredValue(statsSource)

  const plainStatsText = useMemo(() =>
    deferredStatsSource.content
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/^[-*+]\s+\[[ x]\]\s+/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`|]/g, '')
      .trim(),
    [deferredStatsSource],
  )

  const wordCount = plainStatsText.replace(/\s/g, '').length
  const lineCount = plainStatsText ? plainStatsText.split('\n').length : 0
  const readTime = estimateReadMinutes(plainStatsText)

  const sectionStats = useMemo(
    () => computeSectionStats(deferredStatsSource.content),
    [deferredStatsSource],
  )

  const { writingStats, setWritingStats } = useWritingStats(
    wordCount,
    deferredStatsSource.fileId,
    settingsReady,
  )

  const activeGoalOverride = wordGoalOverrides[activeFileId]
  const effectiveGoal = activeGoalOverride !== undefined ? activeGoalOverride : wordGoal
  const goalPercent = goalProgress(wordCount, effectiveGoal)

  const handleGoalChange = useCallback((value: number | undefined) => {
    const fileId = activeFileIdRef.current
    if (!fileId) return
    setWordGoalOverrides((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[fileId]
      else next[fileId] = value
      return next
    })
  }, [activeFileIdRef, setWordGoalOverrides])

  const sectionStatsForIndex = useCallback(
    (headingIndex: number) =>
      headingIndex >= 0 ? sectionStats.sections[headingIndex]?.words : undefined,
    [sectionStats],
  )

  return {
    wordCount,
    lineCount,
    readTime,
    currentSectionWords: undefined, // 由调用方通过 sectionStatsForIndex(cursorPos.headingIndex) 获取
    effectiveGoal,
    goalPercent,
    handleGoalChange,
    writingStats,
    setWritingStats,
    sectionStatsForIndex,
  }
}
