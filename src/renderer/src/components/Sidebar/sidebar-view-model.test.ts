import { describe, expect, it } from 'vitest'
import type { IndexedDocument, WorkspaceIndex } from '../../../../shared/workspace-index'
import { buildSidebarViewModel } from './sidebar-view-model'

const documentOf = (path: string, relativePath: string, tags: string[] = []): IndexedDocument => ({
  path,
  relativePath,
  name: relativePath.split('/').pop() ?? relativePath,
  size: 1,
  modifiedTime: 1,
  headings: [{ level: 1, text: '标题', line: 1 }],
  tags,
  frontmatter: {},
  outgoingLinks: [],
  imageRefs: [],
})

const indexOf = (documents: Record<string, IndexedDocument>, generation = 1): WorkspaceIndex => ({
  workspacePath: 'D:/ws', generatedAt: '2026-01-01T00:00:00.000Z', generation,
  complete: true, truncated: false, documents, links: [], tags: [], assets: [], diagnostics: [],
})

describe('buildSidebarViewModel', () => {
  it('按视图返回文件树、标签、反链和诊断数据，并携带 generation', () => {
    const a = documentOf('D:/ws/a.md', 'a.md', ['Project'])
    const b = documentOf('D:/ws/b.md', 'b.md', ['project', 'Other'])
    const index = indexOf({ [a.path]: a, [b.path]: b })
    const files = buildSidebarViewModel(index, a.path, 'files')
    const tags = buildSidebarViewModel(index, a.path, 'tags')
    const links = buildSidebarViewModel(index, a.path, 'links')
    expect(files.generation).toBe(1)
    expect(files.files.map((file) => file.path)).toEqual([a.path, b.path])
    expect(tags.tags.find((tag) => tag.name.toLowerCase() === 'project')?.paths).toEqual([a.path, b.path])
    expect(links.activePath).toBe(a.path)
    expect(links.backlinks).toEqual([])
  })

  it('generation 更新时只生成新视图数据，不复用旧数组引用', () => {
    const a = documentOf('D:/ws/a.md', 'a.md', ['one'])
    const first = buildSidebarViewModel(indexOf({ [a.path]: a }, 1), a.path, 'tags')
    const second = buildSidebarViewModel(indexOf({ [a.path]: a }, 2), a.path, 'tags')
    expect(second.generation).toBe(2)
    expect(second.tags).not.toBe(first.tags)
  })

  it('按 view 只填充受影响的数据集合', () => {
    const a = documentOf('D:/ws/a.md', 'a.md', ['one'])
    const links: WorkspaceIndex['links'] = [{ sourcePath: a.path, target: 'missing', line: 2, kind: 'wiki' }]
    const index = { ...indexOf({ [a.path]: a }, 3), links }
    const files = buildSidebarViewModel(index, a.path, 'files')
    const tags = buildSidebarViewModel(index, a.path, 'tags')
    const linksView = buildSidebarViewModel(index, a.path, 'links')
    const quality = buildSidebarViewModel(index, a.path, 'quality')
    expect(files.files).toHaveLength(1)
    expect(files.tags).toEqual([])
    expect(tags.tags).toHaveLength(1)
    expect(tags.files).toEqual([])
    expect(linksView.outgoing).toHaveLength(1)
    expect(linksView.tags).toEqual([])
    expect(quality.diagnostics.length).toBeGreaterThan(0)
    expect(quality.files).toEqual([])
  })
})
