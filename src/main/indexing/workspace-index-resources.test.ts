import { describe, expect, it } from 'vitest'
import { parseDocumentIndex } from './document-index-parser'
import {
  buildResourceDependencyIndex,
  collectDocumentsAffectedByChanges,
  refreshDocumentResources,
} from './workspace-index-resources'

describe('workspace-index-resources', () => {
  it('目标路径变化时只选中依赖文档', () => {
    const a = parseDocumentIndex({
      path: 'D:/notes/a.md',
      relativePath: 'a.md',
      name: 'a.md',
      size: 1,
      modifiedTime: 1,
      content: '# A\n\n![图](./pic.png)\n\n见 [B](./b.md)',
    })
    a.outgoingLinks[0].resolvedPath = 'D:/notes/b.md'
    a.imageRefs[0].resolvedPath = 'D:/notes/pic.png'
    const documents = { 'D:/notes/a.md': a, 'D:/notes/b.md': parseDocumentIndex({
      path: 'D:/notes/b.md',
      relativePath: 'b.md',
      name: 'b.md',
      size: 1,
      modifiedTime: 1,
      content: '# B',
    }) }
    const index = buildResourceDependencyIndex(documents)
    const affected = collectDocumentsAffectedByChanges(
      'D:/notes',
      documents,
      index,
      { kind: 'changes', markdownPaths: [], resourcePaths: ['D:/notes/pic.png'] },
    )
    expect(affected).toEqual(new Set(['D:/notes/a.md']))
  })

  it('refreshDocumentResources 清除失效的 resolvedPath 且不修改输入对象', async () => {
    const document = parseDocumentIndex({
      path: 'D:/notes/a.md',
      relativePath: 'a.md',
      name: 'a.md',
      size: 1,
      modifiedTime: 1,
      content: '![图](./pic.png)',
    })
    document.imageRefs[0].resolvedPath = 'D:/notes/pic.png'
    const original = document.imageRefs[0]
    const updated = await refreshDocumentResources(
      document,
      'D:/notes',
      async () => null,
    )
    expect(original.resolvedPath).toBe('D:/notes/pic.png')
    expect(updated.imageRefs[0].resolvedPath).toBeUndefined()
    expect(updated).not.toBe(document)
  })
})
