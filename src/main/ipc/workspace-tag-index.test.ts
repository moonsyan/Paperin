import { describe, expect, it } from 'vitest'
import { extractTagsFromFrontmatter } from './workspace-tag-index'

describe('extractTagsFromFrontmatter', () => {
  it('行内数组写法：tags: [a, b]', () => {
    const md = '---\ntitle: 笔记\ntags: [读书, 写作]\n---\n# 正文'
    expect(extractTagsFromFrontmatter(md)).toEqual(['读书', '写作'])
  })

  it('块级列表写法：- 项目 缩进行', () => {
    const md = '---\ntags:\n  - 项目A\n  - 随笔\nother: x\n---\n正文'
    expect(extractTagsFromFrontmatter(md)).toEqual(['项目A', '随笔'])
  })

  it('逗号分隔标量与单值标量', () => {
    expect(extractTagsFromFrontmatter('---\ntags: 工作, 生活\n---')).toEqual(['工作', '生活'])
    expect(extractTagsFromFrontmatter('---\ntag: 唯一\n---')).toEqual(['唯一'])
  })

  it('去包裹引号与前导 #，去重（大小写不敏感）', () => {
    const md = '---\ntags: ["#日记", \'Zettel\', zettel, 日记]\n---'
    expect(extractTagsFromFrontmatter(md)).toEqual(['日记', 'Zettel'])
  })

  it('无 frontmatter / 未闭合 frontmatter 返回空数组', () => {
    expect(extractTagsFromFrontmatter('# 无元数据\ntags: [x]')).toEqual([])
    expect(extractTagsFromFrontmatter('---\ntags: [未闭合]')).toEqual(['未闭合'])
  })

  it('frontmatter 内无 tags 键返回空数组；正文中的 tags: 不提取', () => {
    expect(extractTagsFromFrontmatter('---\ntitle: t\n---\n正文 tags: [不算]')).toEqual([])
  })

  it('CRLF 换行正常解析', () => {
    expect(extractTagsFromFrontmatter('---\r\ntags: [中文标签]\r\n---\r\n正文')).toEqual(['中文标签'])
  })
})
