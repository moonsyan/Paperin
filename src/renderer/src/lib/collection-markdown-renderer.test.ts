/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'

import { renderMarkdownToHtml, safeExportUrl } from './collection-markdown-renderer'

const parseFragment = (html: string): HTMLElement => {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  return doc.getElementById('root')!
}

describe('safeExportUrl', () => {
  it('危险协议降级为 #', () => {
    expect(safeExportUrl('javascript:alert(1)')).toBe('#')
    expect(safeExportUrl('data:text/html,abc')).toBe('#')
  })

  it('相对路径与 https 保留', () => {
    expect(safeExportUrl('./a.png')).toBe('./a.png')
    expect(safeExportUrl('https://x.com')).toBe('https://x.com')
  })
})

describe('renderMarkdownToHtml', () => {
  it('标题、段落、强调、行内代码、链接与图片', () => {
    const html = renderMarkdownToHtml(
      '# 标题\n\n正文 **加粗** 与 `code` 与 [链接](https://a.com)。\n\n![图](assets/x.png)',
    )
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<a href="https://a.com">链接</a>')
    expect(html).toContain('<img src="assets/x.png" alt="图">')
  })

  it('危险协议链接降级为 #，相对路径与锚点保留', () => {
    const html = renderMarkdownToHtml(
      [
        '[a](javascript:alert(document.cookie))',
        '[b](data:text/html;base64,PHNjcmlwdD4=)',
        '[c](vbscript:msgbox)',
        '[d](jAvA\tscript:alert(1))',
        '[e](https://ok.com)',
        '[f](./page.md)',
        '[g](#anchor)',
      ].join('\n\n'),
    )
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('data:text/html')
    expect(html).not.toContain('vbscript:')
    expect(html).toContain('<a href="#">a</a>')
    expect(html).toContain('<a href="#">b</a>')
    expect(html).toContain('<a href="#">c</a>')
    expect(html).toContain('[d](jAvA\tscript:alert(1))')
    expect(html).toContain('<a href="https://ok.com">e</a>')
    expect(html).toContain('<a href="./page.md">f</a>')
    expect(html).toContain('<a href="#anchor">g</a>')
  })

  it('集合输出保留引用图片并隐藏元数据', () => {
    const html = renderMarkdownToHtml(
      '---\ntitle: 内部标题\n---\n\n![架构图][img]\n\n[img]: assets/a.png',
    )
    expect(html).not.toContain('title: 内部标题')
    expect(html).toContain('src="assets/a.png"')
    expect(html).toContain('alt="架构图"')
  })

  it('中文脚注 reference/definition 关联', () => {
    const html = renderMarkdownToHtml('正文[^注一]\n\n[^注一]: 脚注说明')
    const root = parseFragment(html)
    const ref = root.querySelector('[data-type="footnote_reference"] a')
    const def = root.querySelector('[data-type="footnote_definition"]')
    expect(ref?.textContent).toBe('[注一]')
    expect(def?.querySelector('dd')?.textContent).toContain('脚注说明')
    expect(ref?.getAttribute('href')).toBe(`#${def?.id}`)
  })

  it('重复脚注标签以最后一次定义为准', () => {
    const html = renderMarkdownToHtml('见[^dup]\n\n[^dup]: 第一次\n\n[^dup]: 第二次')
    const root = parseFragment(html)
    const defs = root.querySelectorAll('[data-type="footnote_definition"] dd')
    expect(defs.length).toBeGreaterThanOrEqual(1)
    expect(root.textContent).toContain('第二次')
  })

  it('引用式链接与图片解析定义', () => {
    const html = renderMarkdownToHtml(
      ['[文档][doc]', '![图标][icon]', '', '[doc]: ./guide.md', '[icon]: assets/icon.png'].join('\n'),
    )
    expect(html).toContain('<a href="./guide.md">文档</a>')
    expect(html).toContain('src="assets/icon.png"')
    expect(html).not.toContain('[doc]:')
  })

  it('重复引用标签以最后一次定义为准', () => {
    const html = renderMarkdownToHtml('[链][x]\n\n[x]: first.md\n\n[x]: second.md')
    expect(html).toContain('<a href="second.md">链</a>')
    expect(html).not.toContain('first.md')
  })

  it('危险引用 URL 经 safeExportUrl 降级', () => {
    const html = renderMarkdownToHtml('[点我][bad]\n\n[bad]: javascript:steal()')
    expect(html).toContain('<a href="#">点我</a>')
    expect(html).not.toContain('javascript:')
  })

  it('两层无序列表保留嵌套结构', () => {
    const html = renderMarkdownToHtml('- 外层\n  - 内层')
    const root = parseFragment(html)
    const outerLi = root.querySelector('ul > li')
    expect(outerLi?.querySelector(':scope > p')?.textContent).toContain('外层')
    const nestedUl = outerLi?.querySelector(':scope > ul')
    expect(nestedUl).toBeTruthy()
    expect(nestedUl?.querySelector('li')?.textContent).toContain('内层')
  })

  it('列表项内段落、代码块与引用块', () => {
    const md = [
      '- 项首',
      '',
      '  续段落在同项',
      '',
      '  ```ts',
      '  const x = 1',
      '  ```',
      '',
      '  > 项内引用',
    ].join('\n')
    const root = parseFragment(renderMarkdownToHtml(md))
    const li = root.querySelector('ul > li')
    expect(li?.querySelectorAll('p').length).toBeGreaterThanOrEqual(2)
    expect(li?.querySelector('pre code')?.textContent).toContain('const x = 1')
    expect(li?.querySelector('blockquote')).toBeTruthy()
  })

  it('未闭合 frontmatter 不当作元数据剥离', () => {
    const html = renderMarkdownToHtml('---\ntitle: 未闭合\n\n正文保留')
    expect(html).toContain('正文保留')
    expect(html).toMatch(/title: 未闭合|未闭合/)
  })

  it('公式与 Mermaid 保留源码并标注降级', () => {
    const html = renderMarkdownToHtml('行内 $a+b$\n\n$$\nc=d\n$$\n\n```mermaid\ngraph TD\n  A-->B\n```')
    expect(html).toContain('data-export-degraded="formula"')
    expect(html).toContain('data-export-degraded="mermaid"')
    expect(html).toContain('graph TD')
  })

  it('列表、引用、代码块与分隔线', () => {
    const html = renderMarkdownToHtml('- 一\n- 二\n\n> 引用文字\n\n```ts\nconst a = 1\n```\n\n---')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li><p>一</p></li>')
    expect(html).toContain('<blockquote><p>引用文字</p></blockquote>')
    expect(html).toContain('<pre><code class="language-ts">const a = 1</code></pre>')
    expect(html).toContain('<hr>')
  })

  it('HTML 与脚本默认转义（安全导出）', () => {
    const html = renderMarkdownToHtml('文本 <script>alert(1)</script> 与 <img src=x onerror=y>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('中英文混排与异常输入安全', () => {
    const html = renderMarkdownToHtml('中文 English 混排 **粗体**\n未闭合 `代码')
    expect(html).toContain('中文 English 混排')
    expect(renderMarkdownToHtml('')).toBe('')
  })
})
