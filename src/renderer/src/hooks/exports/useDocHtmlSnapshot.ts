import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import type { EditorHandle } from '../../components/Editor'
import { injectToc } from '../../lib/pdf'
import { renderExportDocHtml } from '../../lib/export-doc-html'
import {
  buildPublishHtml,
  cleanWikiLinksInHtml,
  type PublishOptions,
} from '../../lib/export-bundle'

/**
 * 编辑器 DOM 快照 → 导出用 HTML 字符串。
 *
 * 两个变体：
 * - buildDocHtml：单文档 HTML/PDF/DOCX 导出用的完整页面（含 KaTeX 与打印样式）；
 * - buildPublishedHtml：发布（bundle/富文本复制）用的模板页面，可选注入目录、
 *   清理 Wiki 链接，或使用外部 body/title 覆盖（集合模式）。
 *
 * 抽成 hook 的原因：需要跟随 docTitle / exportCss / editorRef 变化重建，
 * 但业务只关心"给我一个函数"，把 useCallback 依赖数组封在这里避免各流程重复。
 */
export function useDocHtmlSnapshot({
  editorRef,
  docTitle,
  exportCss = null,
}: {
  editorRef: MutableRefObject<EditorHandle | null>
  docTitle: string
  exportCss?: { name: string; content: string } | null
}) {
  const buildDocHtml = useCallback(
    (withToc = false): string => {
      // 用编辑器真实 DOM 快照：保留 Mermaid SVG / KaTeX 渲染结果
      let body = editorRef.current?.getPreviewHtml() ?? ''
      if (withToc) body = injectToc(body)
      const title = docTitle.replace(/\.md$/, '')
      return renderExportDocHtml({ body, title, customCss: exportCss?.content })
    },
    [docTitle, editorRef, exportCss],
  )

  const buildPublishedHtml = useCallback(
    async (
      options: PublishOptions,
      override?: { body: string; title: string },
    ): Promise<string> => {
      if (override) {
        let body = override.body
        if (options.cleanWikiLinks) body = cleanWikiLinksInHtml(body)
        return buildPublishHtml(body, override.title, options)
      }
      let body = editorRef.current?.getPreviewHtml() ?? ''
      if (options.cleanWikiLinks) body = cleanWikiLinksInHtml(body)
      if (options.includeToc) body = injectToc(body)
      const title = docTitle.replace(/\.md$/, '')
      return buildPublishHtml(body, title, options)
    },
    [docTitle, editorRef],
  )

  return { buildDocHtml, buildPublishedHtml }
}
