import { describe, expect, it } from 'vitest'
import {
  ancestorFolderKeysForFile,
  collapsedKeysAfterReveal,
  collapsedKeysAfterRevealFromRecord,
  displayPath,
  relativeDirectorySegments,
} from './path-display'

describe('displayPath（迁移自 CurrentFileBanner，行为保持一致）', () => {
  it('库内文件显示相对路径', () => {
    expect(displayPath('D:/notes/a/b.md', 'D:/notes', 'workspace')).toBe('a/b.md')
  })
  it('根级文件只显示文件名', () => {
    expect(displayPath('D:/notes/b.md', 'D:/notes', 'workspace')).toBe('b.md')
  })
  it('外部文件显示规范化全路径', () => {
    expect(displayPath('D:\\downloads\\b.md', 'D:/notes', 'external')).toBe('D:/downloads/b.md')
  })
  it('无路径：外部显示「外部文件」，库内显示「未保存文档」', () => {
    expect(displayPath(null, 'D:/notes', 'external')).toBe('外部文件')
    expect(displayPath(null, 'D:/notes', 'workspace')).toBe('未保存文档')
  })
})

describe('relativeDirectorySegments', () => {
  it('返回相对目录段（不含文件名）', () => {
    expect(relativeDirectorySegments('D:/notes/learn/method/n.md', 'D:/notes')).toEqual(['learn', 'method'])
  })
  it('根级文件返回空数组', () => {
    expect(relativeDirectorySegments('D:/notes/n.md', 'D:/notes')).toEqual([])
  })
  it('外部文件返回 null', () => {
    expect(relativeDirectorySegments('D:/other/n.md', 'D:/notes')).toBeNull()
  })
  it('路径就是工作区根本身返回 null', () => {
    expect(relativeDirectorySegments('D:/notes', 'D:/notes')).toBeNull()
  })
})

describe('ancestorFolderKeysForFile', () => {
  it('生成祖先目录 key 链（含根，不含文件名）', () => {
    expect(ancestorFolderKeysForFile('D:/notes/a/b/c.md', 'D:/notes')).toEqual([
      'D:/notes',
      'D:/notes/a',
      'D:/notes/a/b',
    ])
  })
  it('外部文件返回空数组', () => {
    expect(ancestorFolderKeysForFile('D:/other/c.md', 'D:/notes')).toEqual([])
  })
})

describe('collapsedKeysAfterReveal', () => {
  const collapsed = ['D:/notes', 'D:/notes/a', 'D:/notes/a/b', 'D:/notes/keep', 'D:/notes/a/keep2']

  it('仅移除目标文件的祖先目录，保留无关折叠', () => {
    expect(collapsedKeysAfterReveal(collapsed, 'D:/notes/a/b/c.md', 'D:/notes', false)).toEqual([
      'D:/notes/keep',
      'D:/notes/a/keep2',
    ])
  })
  it('大小写不敏感口径下同样移除', () => {
    expect(
      collapsedKeysAfterReveal(['d:/NOTES/a'], 'D:/notes/a/b.md', 'D:/notes', true),
    ).toEqual([])
  })
  it('外部文件不改折叠记录', () => {
    expect(collapsedKeysAfterReveal(collapsed, 'D:/other/c.md', 'D:/notes', false)).toEqual(collapsed)
  })
  it('不修改入参数组', () => {
    const input = ['D:/notes/a']
    collapsedKeysAfterReveal(input, 'D:/notes/a/b.md', 'D:/notes', false)
    expect(input).toEqual(['D:/notes/a'])
  })
})

describe('collapsedKeysAfterRevealFromRecord', () => {
  const allFolderKeys = ['D:/notes', 'D:/notes/a', 'D:/notes/a/b', 'D:/notes/x']

  it('记录为 null 且默认全折叠时：基于全量 folder keys 展开祖先', () => {
    expect(
      collapsedKeysAfterRevealFromRecord(null, allFolderKeys, true, 'D:/notes/a/b/c.md', 'D:/notes', false),
    ).toEqual(['D:/notes/x'])
  })
  it('记录为 null 且默认全展开时：返回空数组', () => {
    expect(
      collapsedKeysAfterRevealFromRecord(null, allFolderKeys, false, 'D:/notes/a/b/c.md', 'D:/notes', false),
    ).toEqual([])
  })
  it('有记录时走 collapsedKeysAfterReveal 同一路径', () => {
    expect(
      collapsedKeysAfterRevealFromRecord(['D:/notes/a', 'D:/notes/x'], allFolderKeys, true, 'D:/notes/a/b.md', 'D:/notes', false),
    ).toEqual(['D:/notes/x'])
  })
  it('外部文件返回记录原样', () => {
    expect(
      collapsedKeysAfterRevealFromRecord(['D:/notes/a'], allFolderKeys, true, 'D:/other/c.md', 'D:/notes', false),
    ).toEqual(['D:/notes/a'])
  })
})
