import { describe, expect, it } from 'vitest'
import type { FolderTreeNode } from '../../../preload/api'
import {
  buildPaletteEntries,
  filterCommands,
  filterPaletteEntries,
  findNameMatchRange,
  paletteRelativeDir,
} from './command-palette'

const tree: FolderTreeNode[] = [
  {
    name: 'notes',
    path: 'D:\\wk\\notes',
    children: [
      { name: 'a.md', path: 'D:\\wk\\notes\\a.md' },
      { name: 'ab.md', path: 'D:\\wk\\notes\\ab.md' },
      {
        name: 'sub',
        path: 'D:\\wk\\notes\\sub',
        children: [{ name: 'a.markdown', path: 'D:\\wk\\notes\\sub\\a.markdown' }],
      },
    ],
  },
  { name: 'Readme.MD', path: 'D:\\wk\\Readme.MD' },
  { name: 'image.png', path: 'D:\\wk\\image.png' },
]

describe('buildPaletteEntries', () => {
  it('收集 .md/.markdown（大小写不敏感），跳过目录与其他扩展名', () => {
    const entries = buildPaletteEntries('D:\\wk', tree)
    expect(entries.map((e) => e.name)).toEqual(['a', 'ab', 'a', 'Readme'])
    expect(entries.every((e) => e.kind === 'workspace')).toBe(true)
    expect(entries[2].path).toBe('D:\\wk\\notes\\sub\\a.markdown')
  })

  it('空树返回空数组', () => {
    expect(buildPaletteEntries(undefined, undefined)).toEqual([])
  })

  it('计算相对目录用于同名消歧', () => {
    const entries = buildPaletteEntries('D:\\wk', tree)
    expect(entries[0].dir).toBe('notes')
    expect(entries[2].dir).toBe('notes\\sub')
    expect(entries[3].dir).toBe('')
  })
})

describe('paletteRelativeDir', () => {
  it('大小写不敏感剥离工作区前缀，兼容正斜杠', () => {
    expect(paletteRelativeDir('d:/WK/docs/x.md', 'D:\\wk')).toBe('docs')
  })

  it('路径不在工作区内时回退为完整目录', () => {
    expect(paletteRelativeDir('E:\\other\\x.md', 'D:\\wk')).toBe('E:\\other')
  })

  it('根目录文件目录为空串', () => {
    expect(paletteRelativeDir('D:\\wk\\x.md', 'D:\\wk')).toBe('')
  })
})

describe('filterPaletteEntries', () => {
  const entries = [
    ...buildPaletteEntries('D:\\wk', tree),
    { key: 'demo-1', kind: 'demo' as const, demoId: 'welcome', name: '欢迎', dir: '' },
  ]

  it('空查询按原顺序截断到 limit', () => {
    const out = filterPaletteEntries(entries, '', 2)
    expect(out).toHaveLength(2)
    expect(out[0].name).toBe('a')
  })

  it('名字包含优先于全路径包含', () => {
    const out = filterPaletteEntries(entries, 'readme')
    expect(out[0].name).toBe('Readme')
  })

  it('全路径命中：目录名可作查询词', () => {
    const out = filterPaletteEntries(entries, 'notes/sub')
    expect(out.map((e) => e.path)).toContain('D:\\wk\\notes\\sub\\a.markdown')
  })

  it('无命中返回空数组；中文名大小写不敏感匹配', () => {
    expect(filterPaletteEntries(entries, 'zzz不存在')).toEqual([])
    expect(filterPaletteEntries(entries, '欢迎')[0].demoId).toBe('welcome')
  })

  it('前缀命中的短名字排在前', () => {
    const out = filterPaletteEntries(entries, 'a')
    expect(out[0].name).toBe('a')
    expect(out.map((e) => e.name)).toContain('ab')
  })
})

describe('findNameMatchRange', () => {
  it('返回小写不敏感的命中区间', () => {
    expect(findNameMatchRange('Readme', 'READ')).toEqual({ start: 0, end: 4 })
    expect(findNameMatchRange('Readme', 'xyz')).toBeNull()
    expect(findNameMatchRange('Readme', '')).toBeNull()
  })
})

describe('filterCommands', () => {
  const commands = [
    { id: 'exportPdf', label: '导出 PDF' },
    { id: 'exportHtml', label: '导出 HTML' },
    { id: 'save', label: '保存' },
    { id: 'settings', label: '设置' },
  ]

  it('空查询返回全部（截断到 limit）', () => {
    expect(filterCommands(commands, '')).toHaveLength(4)
    expect(filterCommands(commands, '', 2)).toHaveLength(2)
  })

  it('标签前缀命中优先；无匹配返回空数组', () => {
    const out = filterCommands(commands, '导出')
    expect(out.map((c) => c.id)).toEqual(['exportPdf', 'exportHtml'])
    expect(filterCommands(commands, '不存在')).toEqual([])
  })

  it('可按动作 id 匹配', () => {
    const out = filterCommands(commands, 'settings')
    expect(out.map((c) => c.id)).toEqual(['settings'])
  })
})
