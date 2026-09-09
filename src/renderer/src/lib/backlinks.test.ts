import { describe, expect, it } from 'vitest'
import { buildBacklinkGraph, getBacklinks, getOutgoingLinks } from './backlinks'
import type { FolderTreeNode } from '../../../preload/api'
import type { WorkspaceLinkIndex } from '../../../shared/link-index'

const tree: FolderTreeNode[] = [
  {
    name: '工作区',
    path: 'D:/ws',
    children: [
      { name: 'a.md', path: 'D:/ws/a.md' },
      { name: 'b.md', path: 'D:/ws/b.md' },
      { name: 'sub', path: 'D:/ws/sub', children: [{ name: 'c.md', path: 'D:/ws/sub/c.md' }] },
    ],
  },
]

const index: WorkspaceLinkIndex = {
  files: [
    {
      path: 'D:/ws/a.md',
      mtimeMs: 1,
      size: 10,
      links: [
        { target: 'b', line: 3, preview: '见 [[b]]', kind: 'wiki' },
        { target: './sub/c.md', line: 5, preview: '见 c', kind: 'md' },
      ],
    },
    {
      path: 'D:/ws/b.md',
      mtimeMs: 1,
      size: 10,
      links: [{ target: 'a', alias: '甲', line: 2, preview: '回到 [[a|甲]]', kind: 'wiki' }],
    },
  ],
  truncated: false,
}

describe('buildBacklinkGraph', () => {
  const graph = buildBacklinkGraph(index, 'D:/ws', tree)

  it('解析 wiki/md 两种链接目标', () => {
    expect(graph.edges).toHaveLength(3)
    const fromA = graph.edges.filter((e) => e.sourcePath === 'D:/ws/a.md')
    expect(fromA.map((e) => e.targetPath)).toEqual(['D:/ws/b.md', 'D:/ws/sub/c.md'])
  })

  it('统计入度与出度', () => {
    const a = graph.nodes.find((n) => n.path === 'D:/ws/a.md')
    const b = graph.nodes.find((n) => n.path === 'D:/ws/b.md')
    expect(a).toMatchObject({ inDegree: 1, outDegree: 2 })
    expect(b).toMatchObject({ inDegree: 1, outDegree: 1 })
  })

  it('未解析目标收敛为 ghost 节点', () => {
    const idx: WorkspaceLinkIndex = {
      files: [
        {
          path: 'D:/ws/a.md',
          mtimeMs: 1,
          size: 1,
          links: [
            { target: '不存在', line: 1, preview: '', kind: 'wiki' },
            { target: '不存在 ', line: 2, preview: '', kind: 'wiki' },
          ],
        },
      ],
      truncated: false,
    }
    const g = buildBacklinkGraph(idx, 'D:/ws', tree)
    expect(g.ghosts).toHaveLength(1)
    expect(g.ghosts[0]).toMatchObject({ target: '不存在', refs: 2 })
    expect(g.edges[0]?.targetPath).toBeNull()
  })
})

describe('getBacklinks / getOutgoingLinks', () => {
  const graph = buildBacklinkGraph(index, 'D:/ws', tree)

  it('返回引用指定文件的反链（大小写不敏感）', () => {
    const back = getBacklinks(graph, 'd:/ws/a.md')
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ sourcePath: 'D:/ws/b.md', line: 2, alias: '甲' })
  })

  it('出链按行号排序且包含别名', () => {
    const out = getOutgoingLinks(graph, 'D:/ws/a.md')
    expect(out.map((e) => e.line)).toEqual([3, 5])
    expect(out[0]?.alias).toBeUndefined()
  })

  it('无文件或空图谱返回空数组', () => {
    expect(getBacklinks(null, 'D:/ws/a.md')).toEqual([])
    expect(getBacklinks(graph, null)).toEqual([])
    expect(getOutgoingLinks(graph, 'D:/ws/sub/c.md')).toEqual([])
  })
})
