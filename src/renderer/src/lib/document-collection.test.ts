/** @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import {
  buildCollectionHtml,
  createDocumentFromTemplate,
  extractCollectionOrder,
  extractCollectionTitle,
  orderCollection,
  renderMarkdownToHtml,
} from './document-collection'
import type { CollectionEntry } from './document-collection'
import {
  R09_FIXTURE_MARKERS,
  R09_MULTI_STRUCTURE_EXPORT_ANCHORS,
  buildR09MultiStructureSkeleton,
} from '../../../shared/testing/r09-fixture-contract'

describe('extractCollectionOrder / extractCollectionTitle', () => {
  it('从 Frontmatter 提取 order 与 title，缺失时回退', () => {
    const doc = '---\ntitle: 部署指南\norder: 3\n---\n\n# 另一个标题\n'
    expect(extractCollectionOrder(doc)).toBe(3)
    expect(extractCollectionTitle(doc, '回退名')).toBe('部署指南')
  })

  it('无 Frontmatter 时取首个标题，再回退文件名', () => {
    expect(extractCollectionOrder('# 标题\n正文')).toBe(Number.POSITIVE_INFINITY)
    expect(extractCollectionTitle('## 二级优先\n# 一级也行', '文件名')).toBe('二级优先')
    expect(extractCollectionTitle('没有标题的正文', '文件名')).toBe('文件名')
  })

  it('非法 order 与异常输入安全回退', () => {
    expect(extractCollectionOrder('---\norder: abc\n---\n正文')).toBe(Number.POSITIVE_INFINITY)
    expect(extractCollectionOrder('')).toBe(Number.POSITIVE_INFINITY)
    expect(extractCollectionTitle('', '名')).toBe('名')
  })
})

describe('orderCollection', () => {
  const entry = (path: string, order: number, title = path): CollectionEntry => ({
    path,
    title,
    order,
    content: '',
  })

  it('按 order 升序排列，缺 order 的按路径排在最后', () => {
    const sorted = orderCollection([
      entry('D:/ws/c.md', Number.POSITIVE_INFINITY),
      entry('D:/ws/b.md', 2),
      entry('D:/ws/a.md', 1),
      entry('D:/ws/aa.md', Number.POSITIVE_INFINITY),
    ])
    expect(sorted.map((e) => e.path)).toEqual([
      'D:/ws/a.md',
      'D:/ws/b.md',
      'D:/ws/aa.md',
      'D:/ws/c.md',
    ])
  })

  it('同序号保持输入顺序（稳定排序）', () => {
    const sorted = orderCollection([
      entry('D:/ws/first.md', 5),
      entry('D:/ws/aaa.md', 5),
      entry('D:/ws/bb.md', 5),
    ])
    expect(sorted.map((e) => e.path)).toEqual([
      'D:/ws/first.md',
      'D:/ws/aaa.md',
      'D:/ws/bb.md',
    ])
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
    // scheme 内嵌制表符的写法在 CommonMark 解析层即不成链，保持纯文本
    expect(html).toContain('[d](jAvA\tscript:alert(1))')
    expect(html).toContain('<a href="https://ok.com">e</a>')
    expect(html).toContain('<a href="./page.md">f</a>')
    expect(html).toContain('<a href="#anchor">g</a>')
  })

  it('列表、引用、代码块与分隔线', () => {
    const html = renderMarkdownToHtml('- 一\n- 二\n\n> 引用文字\n\n```ts\nconst a = 1\n```\n\n---')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li><p>一</p></li>')
    expect(html).toContain('<blockquote><p>引用文字</p></blockquote>')
    expect(html).toContain('<pre><code class="language-ts">const a = 1</code></pre>')
    expect(html).toContain('<hr>')
  })

  it('GFM 表格与删除线', () => {
    const html = renderMarkdownToHtml('| x | y |\n|---|---|\n| 1 | 2 |\n\n~~删除~~')
    expect(html).toContain('<table>')
    expect(html).toContain('<del>删除</del>')
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

  it('集合输出保留引用图片并隐藏元数据', () => {
    const html = renderMarkdownToHtml(
      '---\ntitle: 内部标题\n---\n\n![架构图][img]\n\n[img]: assets/a.png',
    )
    expect(html).not.toContain('title: 内部标题')
    expect(html).toContain('src="assets/a.png"')
    expect(html).toContain('alt="架构图"')
  })

  it('A03：中文脚注引用与定义关联', () => {
    const html = renderMarkdownToHtml('正文[^注一]\n\n[^注一]: 脚注说明')
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
    const root = doc.body.firstElementChild!
    const ref = root.querySelector('[data-type="footnote_reference"]')
    expect(ref?.textContent).toContain('注一')
    const def = root.querySelector('[data-type="footnote_definition"]')
    expect(def?.textContent).toContain('脚注说明')
    const href = ref?.querySelector('a')?.getAttribute('href') ?? ''
    expect(def?.id).toBeTruthy()
    expect(href).toBe(`#${def?.id}`)
  })

  it('A03：引用式链接与图片解析定义', () => {
    const html = renderMarkdownToHtml(
      ['[文档][doc]', '![图标][icon]', '', '[doc]: ./guide.md', '[icon]: assets/icon.png'].join('\n'),
    )
    expect(html).toContain('<a href="./guide.md">文档</a>')
    expect(html).toContain('src="assets/icon.png"')
    expect(html).not.toContain('[doc]:')
  })

  it('A03：两层无序列表保留嵌套结构', () => {
    const html = renderMarkdownToHtml('- 外层\n  - 内层')
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
    const outerLi = doc.body.querySelector('ul > li')
    expect(outerLi?.textContent).toContain('外层')
    const nestedUl = outerLi?.querySelector(':scope > ul')
    expect(nestedUl).toBeTruthy()
    expect(nestedUl?.querySelector('li')?.textContent).toContain('内层')
  })
})

describe('buildCollectionHtml', () => {
  it('按顺序拼接章节并生成集合目录', () => {
    const html = buildCollectionHtml([
      { path: 'a.md', title: '第一章', order: 1, content: '<p>内容一</p>' },
      { path: 'b.md', title: '第二章', order: 2, content: '<h1>自带标题</h1><p>内容二</p>' },
    ])
    expect(html).toContain('id="doc-0"')
    expect(html).toContain('id="doc-1"')
    expect(html).toContain('<p>内容一</p>')
    expect(html).toContain('自带标题')
    // 集合目录锚点
    expect(html).toContain('href="#doc-0"')
    expect(html).toContain('href="#doc-1"')
  })
})

describe('createDocumentFromTemplate', () => {
  it('四个模板包含必要标题与代码块', () => {
    const readme = createDocumentFromTemplate('readme', { name: '示例项目', description: '一个示例' })
    expect(readme).toContain('# 示例项目')
    expect(readme).toContain('一个示例')
    expect(readme).toContain('## 安装')

    const api = createDocumentFromTemplate('api', { title: '示例 API' })
    expect(api).toContain('# 示例 API')
    expect(api).toContain('```')
    expect(api).toContain('## 错误码')

    const design = createDocumentFromTemplate('design', { title: '示例设计' })
    expect(design).toContain('# 示例设计')
    expect(design).toContain('## 背景与目标')

    const changelog = createDocumentFromTemplate('changelog', { name: '示例项目' })
    expect(changelog).toContain('# 示例项目')
    expect(changelog).toContain('## 未发布')
    expect(changelog).toContain('### 新增')
  })

  it('技术文章和决策记录是普通 Markdown，且不强制品牌署名', () => {
    const article = createDocumentFromTemplate('article', { title: '如何配置本地预览' })
    expect(article).toContain('# 如何配置本地预览')
    expect(article).toContain('## 步骤')
    expect(article).toContain('## 参考')
    expect(article).not.toContain('Paperin')

    const decision = createDocumentFromTemplate('decision', { title: '是否采用相对链接' })
    expect(decision).toContain('# 是否采用相对链接')
    expect(decision).toContain('## 问题')
    expect(decision).toContain('## 资料来源')
    expect(decision).toContain('## 结论')
    expect(decision).toContain('## 交付检查')
    expect(decision).not.toContain('{{')
    expect(decision).not.toContain('Paperin')
  })

  it('变量缺失时使用明确默认值，不残留空占位符', () => {
    const readme = createDocumentFromTemplate('readme', {})
    expect(readme).not.toContain('{{')
    expect(readme).not.toContain('undefined')
    expect(readme).toContain('未命名项目')
    expect(createDocumentFromTemplate('api', {})).not.toContain('{{')
  })
})

describe('R09 多结构夹具导出', () => {
  it('集合 HTML 保留正文锚点且不泄露 frontmatter 元数据行', () => {
    const html = renderMarkdownToHtml(buildR09MultiStructureSkeleton())
    expect(html).not.toContain('title: R09 多结构夹具')
    for (const anchor of R09_MULTI_STRUCTURE_EXPORT_ANCHORS) {
      expect(html).toContain(anchor)
    }
    expect(buildR09MultiStructureSkeleton()).toContain(R09_FIXTURE_MARKERS.originalTail)
  })
})
