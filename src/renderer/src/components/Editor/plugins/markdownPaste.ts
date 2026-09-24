import { parserCtx, schemaCtx, serializerCtx } from '@milkdown/kit/core'
import { Plugin } from '@milkdown/kit/prose/state'
import { Slice } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import { convertHtmlToMarkdown } from '../../../lib/html-to-markdown'

export const isMarkdownPasteText = (
  text: string,
  html: string,
  hasFiles: boolean,
  context: 'normal' | 'code' | 'frontmatter' = 'normal',
): boolean => {
  if (hasFiles || (!text.trim() && !html.trim())) return false
  if (context !== 'normal') return false
  return true
}

const MARKDOWN_MARK = /^(?:#{1,6}[ \t]|[-*+][ \t]|\d+[.)][ \t]|>[ \t]|```|~~~)/m
const INLINE_MARK = /(?:\*\*|__|~~(?=\S)|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|!\[[^\]]*\]\([^)\n]+\))/

/** text/plain 是否长得像 Markdown（偏排版：有标记即按 MD 解析）。 */
export function looksLikeMarkdown(text: string): boolean {
  const plain = text.trim()
  if (!plain) return false
  return MARKDOWN_MARK.test(plain) || INLINE_MARK.test(plain)
}

/**
 * 方案 C：plain 像 Markdown 时一律优先原文（含同时带着渲染 HTML 的情况）。
 * html 参数保留以便调用方与测试签名稳定；决策不再依赖 HTML 语义。
 */
export function prefersPlainMarkdown(text: string, _html: string): boolean {
  return looksLikeMarkdown(text)
}

export const getPasteMarkdown = (
  clipboard: DataTransfer,
  context: 'normal' | 'code' | 'frontmatter',
): string | null => {
  const text = clipboard.getData('text/plain')
  if (context !== 'normal') return text || null
  if (looksLikeMarkdown(text)) return text

  const html = clipboard.getData('text/html')
  if (html.trim()) {
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

/** 选区 JSON 是否仅为文本（对齐 Milkdown clipboard 的 isPureText）。 */
function isPureTextContent(content: unknown): boolean {
  if (!content) return false
  if (Array.isArray(content)) {
    if (content.length !== 1) return false
    return isPureTextContent(content[0])
  }
  if (typeof content !== 'object') return false
  const record = content as { type?: string; content?: unknown }
  if (record.content) return isPureTextContent(record.content)
  return record.type === 'text'
}

export const markdownPastePlugin = $prose((ctx) =>
  new Plugin({
    props: {
      // 复制时写入 Markdown 源码，保证应用内互贴走「plain 像 MD」分支
      clipboardTextSerializer: (slice, _view) => {
        const serializer = ctx.get(serializerCtx)
        const schema = ctx.get(schemaCtx)
        if (isPureTextContent(slice.content.toJSON())) {
          return slice.content.textBetween(0, slice.content.size, '\n\n')
        }
        const doc = schema.topNodeType.createAndFill(undefined, slice.content)
        if (!doc) return ''
        return serializer(doc)
      },
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
        // parser 得到完整块级内容：open 用 0，勿复用选区 openStart/openEnd
        view.dispatch(
          view.state.tr.replaceSelection(new Slice(document.content, 0, 0)).scrollIntoView(),
        )
        return true
      },
    },
  }),
)
