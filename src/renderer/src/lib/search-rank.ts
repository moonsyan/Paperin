export interface RankableSearchMatch {
  path: string
  line: number
  preview: string
}

const fileNameOf = (path: string): string => {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

/**
 * 可解释排序：文件名精确匹配最高，文件名包含次之，标题行再次，其余保持扫描顺序。
 * 不按模糊相似度重排，避免中文命中被说不清的分数盖住。
 */
export function rankSearchMatches<T extends RankableSearchMatch>(matches: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...matches]
  const score = (match: T): number => {
    const name = fileNameOf(match.path).toLowerCase()
    const stem = name.replace(/\.md$/i, '')
    const preview = match.preview.trim().toLowerCase()
    let value = 0
    if (stem === needle || name === needle) value += 100
    else if (stem.includes(needle) || name.includes(needle)) value += 70
    if (match.path.toLowerCase().includes(needle)) value += 20
    if (preview.startsWith('#') && preview.includes(needle)) value += 40
    return value
  }
  return matches
    .map((match, index) => ({ match, index, score: score(match) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.match)
}

/** 结果行展示最近两级目录和文件名，完整路径仍放在 title 上。 */
export function formatSearchResultPath(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0)
  const name = parts.pop() ?? path
  const directory = parts.slice(-2).join('/')
  return directory ? `${directory}/${name}` : name
}

export const SEARCH_SCOPE_LABEL = '范围：当前知识库的 Markdown。文件名和标题靠前，正文命中靠后。'

export function searchCoverageNotes(input: {
  truncated: boolean
  scanTruncated?: boolean
  matchCapped?: boolean
  matchCount: number
}): string[] {
  const matchCapped = input.matchCapped === true || (input.matchCapped === undefined && input.truncated && input.matchCount >= 200)
  const scanTruncated = input.scanTruncated === true || (input.scanTruncated === undefined && input.truncated && !matchCapped)
  const notes: string[] = []
  if (matchCapped) notes.push('匹配达到 200 条上限，更后面的命中这次没有显示。')
  if (scanTruncated) notes.push('这次没有扫完整个知识库。列表里没有，不等于库里没有。')
  return notes
}

export function searchEmptyMessage(notes: readonly string[]): string {
  return notes.some((note) => note.includes('没有扫完'))
    ? '这次没有扫完，不能当成没有匹配。'
    : '无匹配结果'
}
