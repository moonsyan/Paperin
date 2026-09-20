import { describe, expect, it } from 'vitest'
import type { IndexedDocument, WorkspaceIndex } from '../../../../shared/workspace-index'
import { createInitialWorkspaceCoverage } from '../../../../shared/workspace-coverage'
import { buildGraphData, GRAPH_NODE_LIMIT } from './graph-data'

const documentOf = (path: string, relativePath: string, tags: string[] = []): IndexedDocument => ({
  path,
  relativePath,
  name: relativePath.split('/').pop() ?? relativePath,
  size: 1,
  modifiedTime: 1,
  headings: [],
  tags,
  frontmatter: {},
  outgoingLinks: [],
  imageRefs: [],
})

const indexOf = (documents: Record<string, IndexedDocument>, links: WorkspaceIndex['links'] = []): WorkspaceIndex => ({
  workspacePath: 'D:/ws',
  generatedAt: '2026-01-01T00:00:00.000Z',
  generation: 1,
  complete: true,
  truncated: false,
  coverage: createInitialWorkspaceCoverage(),
  documents,
  links,
  tags: [],
  assets: [],
  diagnostics: [],
})

describe('buildGraphData', () => {
  it('按目录、标签和深度过滤节点与边', () => {
    const a = documentOf('D:/ws/a.md', 'a.md', ['keep'])
    const b = documentOf('D:/ws/docs/b.md', 'docs/b.md', ['keep'])
    const c = documentOf('D:/ws/docs/deep/c.md', 'docs/deep/c.md', ['other'])
    const links: WorkspaceIndex['links'] = [
      { sourcePath: a.path, target: 'b', resolvedPath: b.path, line: 1, kind: 'wiki' },
      { sourcePath: b.path, target: 'c', resolvedPath: c.path, line: 1, kind: 'wiki' },
    ]
    const data = buildGraphData(indexOf({ [a.path]: a, [b.path]: b, [c.path]: c }, links), {
      directory: 'docs',
      tag: 'keep',
      depth: 0,
      activePath: b.path,
    })
    expect(data.nodes.map((node) => node.path)).toEqual([b.path])
    expect(data.links).toEqual([])
  })

  it('默认上限 1200：超过时按度数截断并保留当前节点', () => {
    const documents: Record<string, IndexedDocument> = {}
    const links: WorkspaceIndex['links'] = []
    for (let i = 0; i < 1201; i++) {
      const path = `D:/ws/${i}.md`
      documents[path] = documentOf(path, `${i}.md`)
    }
    const activePath = 'D:/ws/1200.md'
    for (let i = 0; i < 10; i++) {
      links.push({ sourcePath: 'D:/ws/0.md', target: `${i}.md`, resolvedPath: `D:/ws/${i}.md`, line: i + 1, kind: 'wiki' })
    }
    const data = buildGraphData(indexOf(documents, links), { activePath })
    expect(data.nodes).toHaveLength(1200)
    expect(data.nodes.some((node) => node.path === activePath)).toBe(true)
    expect(data.reduced).toBe(true)
  })

  it('maxNodes 选项可调小上限，1200 以内不触发截断', () => {
    const documents: Record<string, IndexedDocument> = {}
    for (let i = 0; i < 601; i++) {
      const path = `D:/ws/${i}.md`
      documents[path] = documentOf(path, `${i}.md`)
    }
    const reduced = buildGraphData(indexOf(documents), { activePath: 'D:/ws/600.md' }, { maxNodes: 600 })
    expect(reduced.nodes).toHaveLength(600)
    expect(reduced.reduced).toBe(true)
    const kept = buildGraphData(indexOf(documents), { activePath: 'D:/ws/600.md' })
    expect(kept.nodes).toHaveLength(601)
    expect(kept.reduced).toBe(false)
  })

  it('maxNodes 钳制到 100–10000，非法值回退默认', () => {
    expect(GRAPH_NODE_LIMIT).toBe(1200)
    const documents: Record<string, IndexedDocument> = {}
    for (let i = 0; i < 150; i++) {
      const path = `D:/ws/${i}.md`
      documents[path] = documentOf(path, `${i}.md`)
    }
    // 低于下限钳制到 100
    const clampedLow = buildGraphData(indexOf(documents), {}, { maxNodes: 10 })
    expect(clampedLow.nodes).toHaveLength(100)
    expect(clampedLow.reduced).toBe(true)
    // 超过上限钳制到 10000，不截断 150 个节点
    const clampedHigh = buildGraphData(indexOf(documents), {}, { maxNodes: 99999 })
    expect(clampedHigh.nodes).toHaveLength(150)
    expect(clampedHigh.reduced).toBe(false)
  })

  it('深度过滤从当前节点扩展邻居，并保留路径上的边', () => {
    const documents: Record<string, IndexedDocument> = {}
    for (const name of ['a', 'b', 'c', 'd']) documents[`D:/ws/${name}.md`] = documentOf(`D:/ws/${name}.md`, `${name}.md`)
    const links: WorkspaceIndex['links'] = [
      { sourcePath: 'D:/ws/a.md', target: 'b', resolvedPath: 'D:/ws/b.md', line: 1, kind: 'wiki' },
      { sourcePath: 'D:/ws/b.md', target: 'c', resolvedPath: 'D:/ws/c.md', line: 1, kind: 'wiki' },
      { sourcePath: 'D:/ws/c.md', target: 'd', resolvedPath: 'D:/ws/d.md', line: 1, kind: 'wiki' },
    ]
    const data = buildGraphData(indexOf(documents, links), { activePath: 'D:/ws/a.md', depth: 2 })
    expect(data.nodes.map((node) => node.path)).toEqual(['D:/ws/a.md', 'D:/ws/b.md', 'D:/ws/c.md'])
    expect(data.links).toHaveLength(2)
  })

  it('搜索、目录和标签筛选可单独命中文档', () => {
    const a = documentOf('D:/ws/docs/a.md', 'docs/a.md', ['keep'])
    const b = documentOf('D:/ws/other/b.md', 'other/b.md', ['other'])
    const index = indexOf({ [a.path]: a, [b.path]: b })
    expect(buildGraphData(index, { search: 'a.md' }).nodes.map((node) => node.path)).toEqual([a.path])
    expect(buildGraphData(index, { directory: 'docs' }).nodes.map((node) => node.path)).toEqual([a.path])
    expect(buildGraphData(index, { tag: 'KEEP' }).nodes.map((node) => node.path)).toEqual([a.path])
  })

  it('hideOrphans 剔除无链接文件，有链接文件与 ghost 保留', () => {
    const linked = documentOf('D:/ws/a.md', 'a.md')
    const orphan = documentOf('D:/ws/orphan.md', 'orphan.md')
    const ghostTarget = '未创建'
    const links: WorkspaceIndex['links'] = [
      { sourcePath: linked.path, target: ghostTarget, resolvedPath: undefined, line: 1, kind: 'wiki' },
    ]
    const index = indexOf({ [linked.path]: linked, [orphan.path]: orphan }, links)
    const hidden = buildGraphData(index, {}, { hideOrphans: true })
    // 只剩有链接的 a 和 ghost（ghost 必有度数）
    expect(hidden.nodes.map((node) => node.id)).toEqual([linked.path, `ghost:${ghostTarget}`])
    expect(hidden.nodes.every((node) => node.degree > 0 || node.ghost)).toBe(true)
    const shown = buildGraphData(index, {}, { hideOrphans: false })
    expect(shown.nodes).toHaveLength(3)
  })
})
