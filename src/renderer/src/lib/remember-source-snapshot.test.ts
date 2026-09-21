import { describe, expect, it } from 'vitest'
import { searchQueryForRelocate } from './remember-source-snapshot'

describe('searchQueryForRelocate', () => {
  it('只用文件名做搜索词，不猜测新目录', () => {
    expect(searchQueryForRelocate('资料/缓存失效策略.md')).toBe('缓存失效策略')
    expect(searchQueryForRelocate('归档\\同名.md')).toBe('同名')
  })
})
