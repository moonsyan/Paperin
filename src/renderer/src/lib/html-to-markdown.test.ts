// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { convertHtmlToMarkdown } from './html-to-markdown'

describe('HTML 转 Markdown', () => {
  it('转换常见结构并保留远程图片 URL', () => {
    const result = convertHtmlToMarkdown(
      '<h1>标题</h1><p><strong>粗体</strong> 与 <em>斜体</em> <a href="https://example.com">链接</a></p><ul><li>一</li><li>二</li></ul><p><img src="https://img.example/a.png" alt="图"></p>',
    )
    expect(result.markdown).toContain('# 标题')
    expect(result.markdown).toContain('**粗体** 与 _斜体_ [链接](<https://example.com>)')
    expect(result.markdown).toContain('- 一\n- 二')
    expect(result.markdown).toContain('![图](<https://img.example/a.png>)')
    expect(result.remoteImages).toBe(1)
  })

  it('过滤危险链接、内联数据图片和样式脚本', () => {
    const result = convertHtmlToMarkdown('<script>alert(1)</script><p>x</p><a href="javascript:alert(1)">坏链</a><img src="data:image/png;base64,abc">')
    expect(result.markdown).toBe('x\n\n坏链')
    expect(result.droppedImages).toBe(1)
  })

  it('保留任务列表复选框', () => {
    const result = convertHtmlToMarkdown('<ul><li><input type="checkbox" checked> 已完成</li><li><input type="checkbox"> 待办</li></ul>')
    expect(result.markdown).toContain('- [x] 已完成')
    expect(result.markdown).toContain('- [ ] 待办')
  })

  it('保留嵌套列表层级', () => {
    const result = convertHtmlToMarkdown('<ul><li>父项<ul><li>子项</li></ul></li></ul>')
    expect(result.markdown).toContain('- 父项')
    expect(result.markdown).toContain('  - 子项')
  })
})
