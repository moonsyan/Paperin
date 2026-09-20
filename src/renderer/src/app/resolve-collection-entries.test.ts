// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { createEmptyWorkspaceIndex, type IndexedDocument } from '../../../shared/workspace-index'
import { resolveCollectionEntries } from './resolve-collection-entries'

const document = (path: string): IndexedDocument => ({
  path,
  relativePath: 'a.md',
  name: 'a.md',
  size: 1,
  modifiedTime: 0,
  headings: [],
  tags: ['note'],
  frontmatter: {},
  outgoingLinks: [],
  imageRefs: [],
})

const makeDoc = (path: string, tags: string[] = ['note']): IndexedDocument => ({
  ...document(path),
  tags,
})

describe('resolveCollectionEntries', () => {
  it('空索引（未扫描）拒绝集合导出并说明索引不完整', async () => {
    const index = createEmptyWorkspaceIndex('D:/vault')
    await expect(
      resolveCollectionEntries({ kind: 'tag', tag: 'note' }, {
        workspaceIndex: index,
        activePath: 'D:/vault/a.md',
        readDocument: vi.fn(),
      }),
    ).rejects.toThrow(/索引不完整/)
  })

  it('truncated 索引拒绝集合导出', async () => {
    const index = createEmptyWorkspaceIndex('D:/vault')
    index.complete = true
    index.truncated = true
    index.documents['D:/vault/a.md'] = makeDoc('D:/vault/a.md')
    await expect(
      resolveCollectionEntries({ kind: 'directory' }, {
        workspaceIndex: index,
        activePath: 'D:/vault/a.md',
        readDocument: vi.fn(),
      }),
    ).rejects.toThrow(/索引不完整/)
  })

  it('完整索引但某篇读失败时不返回部分条目', async () => {
    const index = createEmptyWorkspaceIndex('D:/vault')
    index.complete = true
    index.documents['D:/vault/a.md'] = makeDoc('D:/vault/a.md')
    index.documents['D:/vault/b.md'] = makeDoc('D:/vault/b.md')
    const readDocument = vi.fn(async (path: string) =>
      path.endsWith('a.md')
        ? { ok: true, data: { content: '# A' } }
        : { ok: false },
    )
    await expect(
      resolveCollectionEntries({ kind: 'tag', tag: 'note' }, {
        workspaceIndex: index,
        activePath: 'D:/vault/a.md',
        readDocument,
      }),
    ).rejects.toThrow(/无法读取/)
  })

  it('超过 200 篇时拒绝', async () => {
    const index = createEmptyWorkspaceIndex('D:/vault')
    index.complete = true
    for (let i = 0; i < 201; i++) {
      index.documents[`D:/vault/f${i}.md`] = makeDoc(`D:/vault/f${i}.md`)
    }
    await expect(
      resolveCollectionEntries({ kind: 'tag', tag: 'note' }, {
        workspaceIndex: index,
        activePath: 'D:/vault/f0.md',
        readDocument: vi.fn(),
      }),
    ).rejects.toThrow(/200/)
  })

  it('已打开文档用实时正文，不再读磁盘上的旧内容', async () => {
    const path = 'D:/vault/a.md'
    const index = createEmptyWorkspaceIndex('D:/vault')
    index.complete = true
    index.documents[path] = document(path)
    const readDocument = vi.fn()

    const entries = await resolveCollectionEntries({ kind: 'tag', tag: 'note' }, {
      workspaceIndex: index,
      activePath: path,
      readDocument,
      openContents: [{ path, content: '# 还没保存' }],
    })

    expect(readDocument).not.toHaveBeenCalled()
    expect(entries[0]?.content).toContain('还没保存')
  })
})
