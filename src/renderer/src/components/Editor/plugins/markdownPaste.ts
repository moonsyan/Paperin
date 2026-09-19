import { parserCtx } from '@milkdown/kit/core'
import { Plugin } from '@milkdown/kit/prose/state'
import { Slice } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { convertHtmlToMarkdown } from '../../../lib/html-to-markdown'

export const isMarkdownPasteText = (text: string, html: string, hasFiles: boolean, context: 'normal' | 'code' | 'frontmatter' = 'normal'): boolean => {
  if (hasFiles || (!text.trim() && !html.trim())) return false
  if (context !== 'normal') return false
  return true
}

const MARKDOWN_MARK = /^(?:#{1,6}[ \t]|[-*+][ \t]|\d+[.)][ \t]|>[ \t]|```|~~~)/m
const INLINE_MARK = /(?:\*\*|__|~~(?=\S)|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|!\[[^\]]*\]\([^)\n]+\))/

const compactText = (value: string): string => value.replace(/\s+/g, '')

const decodeCodePoint = (code: number): string => {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ''
  return String.fromCodePoint(code)
}

/** 系统剪贴板经常把同一段 Markdown 原文再包进 HTML。可见文字对得上时，应解析原文，而不是把 # 和 * 转义掉。 */
export function htmlVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|tr|pre|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => decodeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => decodeCodePoint(Number(code)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
}

export function prefersPlainMarkdown(text: string, html: string): boolean {
  const plain = text.trim()
  if (!plain || !html.trim()) return false
  if (!MARKDOWN_MARK.test(plain) && !INLINE_MARK.test(plain)) return false
  const visible = compactText(htmlVisibleText(html))
  const source = compactText(plain)
  if (!visible || !source) return false
  if (visible === source) return true
  // 只接受原文外面多出来的少量包装。整页 HTML 碰巧含有同一小段标记时，仍按富文本转换。
  return visible.includes(source) && visible.length - source.length <= 40
}

export const getPasteMarkdown = (clipboard: DataTransfer, context: 'normal' | 'code' | 'frontmatter'): string | null => {
  const text = clipboard.getData('text/plain')
  if (context !== 'normal') return text || null
  const html = clipboard.getData('text/html')
  if (html.trim()) {
    if (prefersPlainMarkdown(text, html)) return text
    const converted = convertHtmlToMarkdown(html).markdown
    if (converted) return converted
  }
  return text.trim() ? text : null
}

const getPasteContext = (view: EditorView): 'normal' | 'code' | 'frontmatter' => {
  const parentName = view.state.selection.$from.parent.type.name
  if (parentName === 'code_block') return 'code'
  if (parentName === 'frontmatter') return 'frontmatter'
  return 'normal'
}

export const markdownPastePlugin = $prose((ctx) =>
  new Plugin({
    props: {
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData
        if (!clipboard) return false
        const text = clipboard.getData('text/plain')
        const html = clipboard.getData('text/html')
        const hasFiles = Array.from(clipboard.files).length > 0
        const context = getPasteContext(view)
        if (!isMarkdownPasteText(text, html, hasFiles, context)) return false
        const markdown = getPasteMarkdown(clipboard, context)
        if (!markdown) return false

        let document
        try {
          document = ctx.get(parserCtx)(markdown)
        } catch {
          return false
        }
        // 解析为空文档（如纯 HTML 注释等 schema 外内容）时放行 PM 默认粘贴，
        // 否则空 Slice 会静默删除选区且不插入任何内容
        if (!document || document.content.size === 0) return false
        event.preventDefault()
        const selectedContent = view.state.selection.content()
        view.dispatch(
          view.state.tr
            .replaceSelection(new Slice(document.content, selectedContent.openStart, selectedContent.openEnd))
            .scrollIntoView(),
        )
        return true
      },
    },
  }),
)
