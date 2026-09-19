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

describe('resolveCollectionEntries', () => {
  it('已打开文档用实时正文，不再读磁盘上的旧内容', async () => {
    const path = 'D:/vault/a.md'
    const index = createEmptyWorkspaceIndex('D:/vault')
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
