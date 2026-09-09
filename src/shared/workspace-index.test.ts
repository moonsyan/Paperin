import { describe, expect, it } from 'vitest'
import type { IndexedDocument } from './workspace-index'
import {
  collectAssetReferences,
  createEmptyWorkspaceIndex,
  removeDocumentFromIndex,
  upsertDocumentIntoIndex,
} from './workspace-index'

const doc = (path: string, imageTargets: string[] = [], links: { target: string }[] = []): IndexedDocument => ({
  path,
  relativePath: path.replace(/^D:\//, ''),
  name: path.split('/').pop() ?? path,
  size: 10,
  modifiedTime: 1,
  headings: [{ level: 1, text: '标题', line: 1 }],
  tags: ['标签'],
  frontmatter: {},
  outgoingLinks: links.map((l, i) => ({ sourcePath: path, target: l.target, line: i + 1, kind: 'wiki' as const })),
  imageRefs: imageTargets.map((target, i) => ({ sourcePath: path, target, line: i + 1 })),
})

describe('createEmptyWorkspaceIndex', () => {
  it('生成带 generation 与空集合的完整索引骨架', () => {
    const index = createEmptyWorkspaceIndex('D:/notes')
    expect(index.workspacePath).toBe('D:/notes')
    expect(index.generation).toBe(0)
    expect(index.complete).toBe(false)
    expect(index.truncated).toBe(false)
    expect(index.documents).toEqual({})
    expect(index.links).toEqual([])
    expect(index.tags).toEqual([])
    expect(index.assets).toEqual([])
    expect(index.diagnostics).toEqual([])
    expect(typeof index.generatedAt).toBe('string')
  })
})

describe('upsert / remove 增量更新', () => {
  it('upsert 写入文档并把出链汇总进 links，返回新索引不改原对象', () => {
    const index = createEmptyWorkspaceIndex('D:/notes')
    const docA = doc('D:/notes/a.md', [], [{ target: 'b' }])
    const next = upsertDocumentIntoIndex(index, docA)
    expect(next.documents['D:/notes/a.md']).toBe(docA)
    expect(next.links).toEqual([{ sourcePath: 'D:/notes/a.md', target: 'b', line: 1, kind: 'wiki' }])
    expect(index.documents['D:/notes/a.md']).toBeUndefined()
  })

  it('重复 upsert 覆盖同文档且 links 不残留旧条目', () => {
    let index = createEmptyWorkspaceIndex('D:/notes')
    index = upsertDocumentIntoIndex(index, doc('D:/notes/a.md', [], [{ target: 'old' }]))
    index = upsertDocumentIntoIndex(index, doc('D:/notes/a.md', [], [{ target: 'new' }]))
    expect(index.links.map((l) => l.target)).toEqual(['new'])
  })

  it('remove 清除文档及其 links/tags 贡献', () => {
    let index = createEmptyWorkspaceIndex('D:/notes')
    index = upsertDocumentIntoIndex(index, doc('D:/notes/a.md', ['p.png'], [{ target: 'b' }]))
    index = upsertDocumentIntoIndex(index, doc('D:/notes/b.md'))
    const next = removeDocumentFromIndex(index, 'D:/notes/a.md')
    expect(next.documents['D:/notes/a.md']).toBeUndefined()
    expect(next.links).toEqual([])
    expect(next.documents['D:/notes/b.md']).toBeDefined()
  })

  it('remove 不存在的文档返回原引用', () => {
    const index = createEmptyWorkspaceIndex('D:/notes')
    expect(removeDocumentFromIndex(index, 'D:/notes/ghost.md')).toBe(index)
  })
})

describe('collectAssetReferences（assets 派生）', () => {
  it('按目标聚合引用方，去重且保持路径稳定', () => {
    const documents = {
      'D:/notes/a.md': doc('D:/notes/a.md', ['img/p.png', 'img/p.png']),
      'D:/notes/b.md': doc('D:/notes/b.md', ['img/p.png']),
    }
    const assets = collectAssetReferences(documents)
    expect(assets).toEqual([
      {
        path: 'img/p.png',
        relativePath: 'img/p.png',
        size: 0,
        referencedBy: ['D:/notes/a.md', 'D:/notes/b.md'],
      },
    ])
  })
})
