import { describe, expect, it } from 'vitest'
import { parseDocumentIndex } from './document-index-parser'

const input = (content: string, overrides: Record<string, unknown> = {}) => ({
  path: 'D:/notes/a.md',
  relativePath: 'a.md',
  name: 'a.md',
  size: content.length,
  modifiedTime: 100,
  content,
  ...overrides,
})

describe('parseDocumentIndex：标题', () => {
  it('提取普通标题与中文标题及行号', () => {
    const parsed = parseDocumentIndex(
      input(['# 总览', '', '## 使用说明', '', '正文。'].join('\n')),
    )
    expect(parsed.headings).toEqual([
      { level: 1, text: '总览', line: 1 },
      { level: 2, text: '使用说明', line: 3 },
    ])
  })

  it('代码围栏内的伪标题与伪链接不进索引', () => {
    const md = [
      '# 真标题',
      '',
      '```md',
      '## 伪标题',
      '[[伪链接]]',
      '![伪图](fake.png)',
      '```',
      '',
      '正文 [[真链接]]。',
    ].join('\n')
    const parsed = parseDocumentIndex(input(md))
    expect(parsed.headings.map((h) => h.text)).toEqual(['真标题'])
    expect(parsed.outgoingLinks.map((l) => l.target)).toEqual(['真链接'])
    expect(parsed.imageRefs).toEqual([])
  })

  it('空标题收录（供 EMPTY_HEADING 诊断识别）', () => {
    const parsed = parseDocumentIndex(input('#\n正文'))
    expect(parsed.headings).toEqual([{ level: 1, text: '', line: 1 }])
  })

  it('setext 标题与现有大纲口径一致', () => {
    const parsed = parseDocumentIndex(input(['段落文字', '===', '', '后文'].join('\n')))
    expect(parsed.headings).toEqual([{ level: 1, text: '段落文字', line: 1 }])
  })
})

describe('parseDocumentIndex：标签与 frontmatter', () => {
  it('提取 frontmatter tags（块级列表）与顶层标量键', () => {
    const md = ['---', 'title: 项目笔记', 'tags:', '  - 读书', '  - 写作', 'status: 进行中', '---', '', '# 正文'].join('\n')
    const parsed = parseDocumentIndex(input(md))
    expect(parsed.tags).toEqual(['读书', '写作'])
    expect(parsed.frontmatter).toEqual({ title: '项目笔记', status: '进行中' })
  })

  it('未闭合 frontmatter：标签沿用面板宽松口径，正文行不误判为键值', () => {
    const parsed = parseDocumentIndex(input('---\ntags: [a]\n# 标题\n正文'))
    expect(parsed.tags).toEqual(['a'])
    expect(parsed.frontmatter).toEqual({})
    expect(parsed.headings).toEqual([])
  })

  it('无 frontmatter 的文档 tags/frontmatter 为空', () => {
    const parsed = parseDocumentIndex(input('# 无元数据'))
    expect(parsed.tags).toEqual([])
    expect(parsed.frontmatter).toEqual({})
  })
})

describe('parseDocumentIndex：链接与图片引用', () => {
  it('wiki 链接与相对 md 链接进入 outgoingLinks，含行号', () => {
    const md = ['参考 [[笔记一]] 与 [笔记二](./sub/笔记二.md)。', '', '外链 https://a.com 不算'].join('\n')
    const parsed = parseDocumentIndex(input(md))
    expect(parsed.outgoingLinks).toEqual([
      { sourcePath: 'D:/notes/a.md', target: '笔记一', line: 1, kind: 'wiki' },
      { sourcePath: 'D:/notes/a.md', target: './sub/笔记二.md', line: 1, kind: 'md' },
    ])
  })

  it('相对图片进入 imageRefs；远程图片不算本地资源', () => {
    const md = ['![本地图](attachments/pic.png)', '', '![远程图](https://a.com/x.png)'].join('\n')
    const parsed = parseDocumentIndex(input(md))
    expect(parsed.imageRefs).toEqual([
      { sourcePath: 'D:/notes/a.md', target: 'attachments/pic.png', line: 1 },
    ])
  })
})

describe('parseDocumentIndex：输入防护', () => {
  it('超大输入拒绝解析：返回空字段而非抛错', () => {
    const big = '# t\n'.repeat(600_000) // ≈2.4MB
    const parsed = parseDocumentIndex(input(big))
    expect(parsed.headings).toEqual([])
    expect(parsed.outgoingLinks).toEqual([])
    expect(parsed.tags).toEqual([])
    expect(parsed.imageRefs).toEqual([])
    expect(parsed.frontmatter).toEqual({})
  })

  it('解析结果携带输入的路径/相对路径/名称/大小/mtime', () => {
    const parsed = parseDocumentIndex(
      input('# t', { path: 'D:/notes/b/c.md', relativePath: 'b/c.md', name: 'c.md', size: 9, modifiedTime: 55 }),
    )
    expect(parsed.path).toBe('D:/notes/b/c.md')
    expect(parsed.relativePath).toBe('b/c.md')
    expect(parsed.name).toBe('c.md')
    expect(parsed.size).toBe(9)
    expect(parsed.modifiedTime).toBe(55)
  })
})
