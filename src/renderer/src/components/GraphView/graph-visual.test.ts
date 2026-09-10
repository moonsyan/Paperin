import { describe, expect, it } from 'vitest'

import type { GraphData } from './graph-data'
import {
  baseNodeRadius,
  buildGraphAdjacency,
  buildGraphStructureSignature,
  findGraphFilterMatches,
  folderHue,
} from './graph-visual'

const data: GraphData = {
  nodes: [
    { id: 'notes/a.md', path: 'notes/a.md', label: 'Alpha', folder: 'notes', ghost: false, degree: 2 },
    { id: 'notes/b.md', path: 'notes/b.md', label: 'Beta', folder: 'notes', ghost: false, degree: 1 },
    { id: 'ghost:missing', path: null, label: '未解析', folder: '', ghost: true, degree: 1 },
  ],
  links: [
    { source: 'notes/a.md', target: 'notes/b.md' },
    { source: 'notes/a.md', target: 'ghost:missing' },
  ],
  reduced: false,
}

describe('graph visual helpers', () => {
  it('用节点度数和连接生成稳定的结构签名', () => {
    expect(buildGraphStructureSignature(data)).toBe(
      'notes/a.md:2|notes/b.md:1|ghost:missing:1##notes/a.md>notes/b.md|notes/a.md>ghost:missing',
    )
    expect(buildGraphStructureSignature(null)).toBe('')
  })

  it('按标签、路径或目录进行不区分大小写的匹配', () => {
    expect(findGraphFilterMatches(data, 'ALP')).toEqual(new Set(['notes/a.md']))
    expect(findGraphFilterMatches(data, 'notes')).toEqual(
      new Set(['notes/a.md', 'notes/b.md']),
    )
    expect(findGraphFilterMatches(data, '   ')).toBeNull()
  })

  it('建立双向相邻表并保持稳定的视觉尺度', () => {
    const adjacency = buildGraphAdjacency(data)
    expect(adjacency.get('notes/a.md')).toEqual(
      new Set(['notes/b.md', 'ghost:missing']),
    )
    expect(adjacency.get('notes/b.md')).toEqual(new Set(['notes/a.md']))
    expect(baseNodeRadius(0)).toBe(5)
    expect(baseNodeRadius(100)).toBe(15)
    expect(folderHue('notes')).toBe(folderHue('notes'))
    expect(folderHue('notes')).toBeGreaterThanOrEqual(0)
    expect(folderHue('notes')).toBeLessThan(360)
  })
})
