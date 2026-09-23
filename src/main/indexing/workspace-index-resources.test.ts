import { describe, expect, it } from 'vitest'
import { performance } from 'perf_hooks'
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
    const documents = {
      'D:/notes/a.md': a,
      'D:/notes/b.md': parseDocumentIndex({
        path: 'D:/notes/b.md',
        relativePath: 'b.md',
        name: 'b.md',
        size: 1,
        modifiedTime: 1,
        content: '# B',
      }),
    }
    const index = buildResourceDependencyIndex(documents)
    const affected = collectDocumentsAffectedByChanges(
      'D:/notes',
      documents,
      index,
      { kind: 'changes', markdownPaths: [], resourcePaths: ['D:/notes/pic.png'] },
    )
    expect(affected).toEqual(new Set(['D:/notes/a.md']))
  })

  it('wiki 茎与未解析相对目标经索引命中，不依赖全表扫描', () => {
    const hub = parseDocumentIndex({
      path: 'D:/notes/hub.md',
      relativePath: 'hub.md',
      name: 'hub.md',
      size: 1,
      modifiedTime: 1,
      content: '见 [[TargetNote]] 与 [缺](./missing.md)',
    })
    const documents = {
      'D:/notes/hub.md': hub,
      'D:/notes/other.md': parseDocumentIndex({
        path: 'D:/notes/other.md',
        relativePath: 'other.md',
        name: 'other.md',
        size: 1,
        modifiedTime: 1,
        content: '# other',
      }),
    }
    const index = buildResourceDependencyIndex(documents)
    const byWiki = collectDocumentsAffectedByChanges(
      'D:/notes',
      documents,
      index,
      { kind: 'changes', markdownPaths: ['D:/notes/TargetNote.md'], resourcePaths: [] },
    )
    expect(byWiki).toEqual(new Set(['D:/notes/hub.md']))
    const byRelative = collectDocumentsAffectedByChanges(
      'D:/notes',
      documents,
      index,
      { kind: 'changes', markdownPaths: ['D:/notes/missing.md'], resourcePaths: [] },
    )
    expect(byRelative).toEqual(new Set(['D:/notes/hub.md']))
  })

  it('5000 路径变更不得对文档表做 O(变更×文档) 全扫', () => {
    const documents: Record<string, ReturnType<typeof parseDocumentIndex>> = {}
    for (let i = 0; i < 5000; i++) {
      const path = `D:/notes/${String(i).padStart(5, '0')}.md`
      documents[path] = parseDocumentIndex({
        path,
        relativePath: `${String(i).padStart(5, '0')}.md`,
        name: `${String(i).padStart(5, '0')}.md`,
        size: 1,
        modifiedTime: 1,
        content: `# ${i}`,
      })
    }
    const paths = Object.keys(documents)
    const index = buildResourceDependencyIndex(documents)
    const started = performance.now()
    const affected = collectDocumentsAffectedByChanges(
      'D:/notes',
      documents,
      index,
      { kind: 'changes', markdownPaths: paths, resourcePaths: [] },
    )
    const elapsed = performance.now() - started
    expect(affected.size).toBe(0)
    // 旧实现约 7s+；索引查找应远低于 1s（留余量给 CI）
    expect(elapsed).toBeLessThan(1000)
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
