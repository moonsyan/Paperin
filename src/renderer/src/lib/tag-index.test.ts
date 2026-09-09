import { describe, expect, it } from 'vitest'
import type { WorkspaceTagIndexEntry } from '../../../shared/tag-index'
import { buildTagGroups, findTagGroup } from './tag-index'

const entry = (path: string, tags: string[]): WorkspaceTagIndexEntry => ({
  path,
  mtimeMs: 0,
  size: 0,
  tags,
})

describe('buildTagGroups', () => {
  it('聚合并去重路径，文件数多的排前', () => {
    const groups = buildTagGroups([
      entry('a.md', ['笔记', '项目']),
      entry('b.md', ['笔记']),
      entry('a.md', ['笔记']),
    ])
    expect(groups[0].tag).toBe('笔记')
    expect(groups[0].paths).toEqual(['a.md', 'b.md'])
    expect(groups[1].tag).toBe('项目')
    expect(groups[1].paths).toEqual(['a.md'])
  })

  it('大小写不敏感合并，展示名取首次出现', () => {
    const groups = buildTagGroups([entry('a.md', ['Zettel']), entry('b.md', ['zettel'])])
    expect(groups).toHaveLength(1)
    expect(groups[0].tag).toBe('Zettel')
    expect(groups[0].paths).toEqual(['a.md', 'b.md'])
  })

  it('同文件数时中文名按 locale 升序', () => {
    const groups = buildTagGroups([
      entry('a.md', ['随笔']),
      entry('b.md', ['日记']),
    ])
    expect(groups.map((g) => g.tag)).toEqual(['日记', '随笔'])
  })

  it('空索引返回空数组', () => {
    expect(buildTagGroups([])).toEqual([])
  })
})

describe('findTagGroup', () => {
  it('大小写不敏感查找；未命中返回 null', () => {
    const groups = buildTagGroups([entry('a.md', ['Note'])])
    expect(findTagGroup(groups, 'note')?.tag).toBe('Note')
    expect(findTagGroup(groups, '其他')).toBeNull()
  })
})
