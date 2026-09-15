// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTagFilter } from './useTagFilter'

const index = { files: [{ path: '/w/中文.md', tags: ['研究'], mtimeMs: 0, size: 1 }], truncated: false }

describe('useTagFilter', () => {
  it('同一标签再选取消，切换知识库清掉旧路径选择', () => {
    const { result, rerender } = renderHook(({ root }) => useTagFilter(root, index), { initialProps: { root: '/w' } })
    act(() => result.current.handleToggleTagFilter('研究'))
    expect(result.current.tagFilter?.paths).toEqual(['/w/中文.md'])
    act(() => result.current.handleToggleTagFilter('研究'))
    expect(result.current.tagFilter).toBeNull()
    act(() => result.current.handleToggleTagFilter('研究'))
    rerender({ root: '/other' })
    expect(result.current.tagFilter).toBeNull()
  })
})
