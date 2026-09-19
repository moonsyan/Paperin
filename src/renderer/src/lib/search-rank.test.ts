import { describe, expect, it } from 'vitest'
import {
  formatSearchResultPath,
  rankSearchMatches,
  searchCoverageNotes,
  searchEmptyMessage,
} from './search-rank'

describe('rankSearchMatches', () => {
  it('中文文件名精确匹配排在正文命中前面，同分保持原顺序', () => {
    const ranked = rankSearchMatches([
      { path: 'D:/库/正文.md', line: 8, preview: '这里提到研究笔记' },
      { path: 'D:/库/其他/研究笔记.md', line: 1, preview: '# 别的标题' },
      { path: 'D:/库/资料/草稿.md', line: 2, preview: '# 研究笔记的提纲' },
    ], '研究笔记')
    expect(ranked.map((item) => item.path)).toEqual([
      'D:/库/其他/研究笔记.md',
      'D:/库/资料/草稿.md',
      'D:/库/正文.md',
    ])
  })

  it('空查询不改变顺序', () => {
    const matches = [{ path: 'b.md', line: 1, preview: 'b' }, { path: 'a.md', line: 1, preview: 'a' }]
    expect(rankSearchMatches(matches, '  ')).toEqual(matches)
  })
})

describe('formatSearchResultPath', () => {
  it('保留最近两级目录', () => {
    expect(formatSearchResultPath('D:\\库\\资料\\文章.md')).toBe('库/资料/文章.md')
    expect(formatSearchResultPath('笔记.md')).toBe('笔记.md')
  })
})

describe('searchCoverageNotes', () => {
  it('匹配上限和未扫完可以同时说明', () => {
    expect(searchCoverageNotes({
      truncated: true,
      scanTruncated: true,
      matchCapped: true,
      matchCount: 200,
    })).toEqual([
      '匹配达到 200 条上限，更后面的命中这次没有显示。',
      '这次没有扫完整个知识库。列表里没有，不等于库里没有。',
    ])
  })

  it('旧的单一截断标志按结果数区分', () => {
    expect(searchCoverageNotes({ truncated: true, matchCount: 3 })[0]).toContain('没有扫完')
    expect(searchCoverageNotes({ truncated: true, matchCount: 200 })[0]).toContain('200')
    expect(searchCoverageNotes({ truncated: false, matchCount: 1 })).toEqual([])
  })

  it('未扫完时不把空列表说成确定无结果', () => {
    const notes = searchCoverageNotes({ truncated: true, scanTruncated: true, matchCount: 0 })
    expect(searchEmptyMessage(notes)).toContain('不能当成没有匹配')
    expect(searchEmptyMessage([])).toBe('无匹配结果')
  })
})
