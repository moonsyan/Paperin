export interface HtmlToMarkdownResult {
  markdown: string
  remoteImages: number
  droppedImages: number
}

// < 必须转义：正文里的 `x<y and y>z` 不转义会被 CommonMark 当作内联
// HTML 标签吞掉，粘贴的内容重新渲染后丢失；> 同时转义防行首块引用歧义
const escapeText = (value: string): string => value.replace(/[\\`*_[\]#<>]/g, '\\$&')

export const convertHtmlToMarkdown = (html: string): HtmlToMarkdownResult => {
  // 剪贴板 HTML 可能带 img/onerror。innerHTML 会在渲染进程里加载并执行，
  // 而这里能碰到 desktopAPI。DOMParser 只解析，不跑脚本、不拉图片。
  const root = new DOMParser().parseFromString(html, 'text/html').body
  root.querySelectorAll('script,style,noscript,template').forEach((node) => node.remove())
  let remoteImages = 0
  let droppedImages = 0

  const render = (node: Node, depth = 0): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    const element = node as HTMLElement
    const children = () => Array.from(element.childNodes).map((child) => render(child, depth)).join('')
    const tag = element.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${children().trim()}\n\n`
    if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') return `\n\n${children().trim()}\n\n`
    if (tag === 'br') return '\n'
    if (tag === 'strong' || tag === 'b') return `**${children().trim()}**`
    if (tag === 'em' || tag === 'i') return `_${children().trim()}_`
    if (tag === 'code' && element.parentElement?.tagName.toLowerCase() !== 'pre') return `\`${element.textContent ?? ''}\``
    if (tag === 'pre') return `\n\n\`\`\`\n${element.textContent ?? ''}\n\`\`\`\n\n`
    if (tag === 'blockquote') return `\n\n${children().trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`
    if (tag === 'table') {
      const rows = Array.from(element.querySelectorAll('tr')).map((row) =>
        Array.from(row.children).map((cell) => (cell.textContent ?? '').trim().replace(/\|/g, '\\|')),
      )
      if (rows.length === 0) return ''
      const header = rows[0]
      const body = rows.slice(1)
      return `\n\n| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |${body.map((row) => `\n| ${row.join(' | ')} |`).join('')}\n\n`
    }
    if (tag === 'a') {
      const href = element.getAttribute('href')?.trim() ?? ''
      if (/^(?:https?:|mailto:)/i.test(href)) return `[${children().trim()}](<${href}>)`
      return children()
    }
    if (tag === 'img') {
      const src = element.getAttribute('src')?.trim() ?? ''
      if (/^https?:\/\//i.test(src)) {
        remoteImages++
        return `![${element.getAttribute('alt') ?? ''}](<${src}>)`
      }
      droppedImages++
      return ''
    }
    if (tag === 'input' && element.getAttribute('type')?.toLowerCase() === 'checkbox') {
      return element.hasAttribute('checked') ? '[x] ' : '[ ] '
    }
    if (tag === 'li') {
      const content = children().trim().replace(/^\[([ x])\]\s+/, '[$1] ')
      return `${'  '.repeat(Math.max(0, depth - 1))}- ${content}\n`
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(element.children).filter((child) => child.tagName.toLowerCase() === 'li')
      return `\n\n${items.map((item, index) => {
        const content = render(item, depth + 1).trim().replace(/^-\s+/, '')
        const prefix = tag === 'ol' ? `${index + 1}. ` : '- '
        return `${'  '.repeat(Math.max(0, depth))}${prefix}${content}`
      }).join('\n')}\n\n`
    }
    return children()
  }

  const markdown = render(root)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { markdown, remoteImages, droppedImages }
}
