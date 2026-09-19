import { describe, expect, it } from 'vitest'
import { buildSourceCitation, citationTargetsCurrentDocument, headingAnchor, relativeMarkdownHref } from './source-citation'

describe('buildSourceCitation', () => {
  it('中文同名文件使用相对目录，片段是插入时的快照', () => {
    const snippet = '旧段落'
    const markdown = buildSourceCitation(snippet, 'D:/笔记/今天/文章.md', 'D:/笔记/资料/文章.md')
    expect(markdown).toContain('> 旧段落')
    expect(markdown).toContain('](../%E8%B5%84%E6%96%99/%E6%96%87%E7%AB%A0.md)')
    expect(relativeMarkdownHref('D:/笔记/今天/文章.md', 'D:/笔记/资料/文章.md')).toBe('../%E8%B5%84%E6%96%99/%E6%96%87%E7%AB%A0.md')
    expect(buildSourceCitation(`${snippet}后续变化`, 'D:/笔记/今天/文章.md', 'D:/笔记/资料/文章.md')).not.toBe(markdown)
  })

  it('没有当前路径时仍给出可打开的来源链接，且不串到另一篇', () => {
    expect(buildSourceCitation('片段', null, 'D:/外部/笔记.md')).toContain('](D:/%E5%A4%96%E9%83%A8/%E7%AC%94%E8%AE%B0.md)')
    expect(citationTargetsCurrentDocument('file-a', 'file-a')).toBe(true)
    expect(citationTargetsCurrentDocument('file-a', 'file-b')).toBe(false)
  })

  it('标题行带标准锚点，普通段落不带，且不改来源文本', () => {
    const heading = '# 研究笔记'
    const markdown = buildSourceCitation(heading, 'D:/笔记/今天/文章.md', 'D:/笔记/资料/文章.md')
    expect(headingAnchor(heading)).toBe('研究笔记')
    expect(markdown).toContain(`#${encodeURIComponent('研究笔记')}`)
    expect(buildSourceCitation('普通段落', 'D:/笔记/今天/文章.md', 'D:/笔记/资料/文章.md')).not.toContain('#')
    expect(heading).toBe('# 研究笔记')
  })
})
