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

export const getPasteMarkdown = (clipboard: DataTransfer, context: 'normal' | 'code' | 'frontmatter'): string | null => {
  const text = clipboard.getData('text/plain')
  if (context !== 'normal') return text || null
  const html = clipboard.getData('text/html')
  if (html.trim()) return convertHtmlToMarkdown(html).markdown || null
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
