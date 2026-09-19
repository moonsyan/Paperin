import { describe, expect, it } from 'vitest'
import { renderExportDocHtml } from './export-doc-html'

describe('renderExportDocHtml', () => {
  it('把标题、正文与自定义 CSS 组合成完整 HTML 页面', () => {
    const html = renderExportDocHtml({
      body: '<p>正文</p>',
      title: '设计说明',
      customCss: 'body{background:#fff}',
    })
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>设计说明</title>')
    expect(html).toContain('<p>正文</p>')
    // 自定义 CSS 追加在默认样式之后，允许覆盖
    expect(html.indexOf('body{background:#fff}')).toBeGreaterThan(html.indexOf('body{font-family'))
  })

  it('customCss 缺省时不产生第三个 style 块', () => {
    const html = renderExportDocHtml({ body: '<p>x</p>', title: 't' })
    // KaTeX 内联 + 默认样式共 2 个 style 块；vitest 里 KaTeX CSS 内容为空但标签仍存在
    expect(html.match(/<style>/g)?.length).toBe(2)
  })

  it('标题走 escapeHtmlText，避免注入脚本或标签', () => {
    const html = renderExportDocHtml({
      body: '<p>x</p>',
      title: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('自定义 CSS 不能靠 </style> 逃出 style 标签', () => {
    const html = renderExportDocHtml({
      body: '<p>x</p>',
      title: 't',
      customCss: 'body{color:red}</style><script>alert(1)</script><style>p{color:blue}',
    })
    expect(html).not.toContain('</style><script>alert(1)</script>')
    expect(html).not.toMatch(/<script\b/i)
    expect(html).toContain('body{color:red}')
  })

  it('保留任务列表勾选框、脚注、目录分页样式（浏览器打印/PDF 依赖）', () => {
    const html = renderExportDocHtml({ body: '<p>x</p>', title: 't' })
    expect(html).toContain('li[data-item-type=task][data-checked=true]')
    expect(html).toContain('dl[data-type=footnote_definition]')
    expect(html).toContain('.doc-toc{page-break-after:always}')
  })
})
