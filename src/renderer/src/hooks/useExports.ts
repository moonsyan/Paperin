import type { PdfOptions } from '../components/ExportPdfDialog'
import type { PublishOptions, PublishScope } from '../lib/export-bundle'
import type { UseExportsOptions } from './exports/types'
import { useExportSession } from './exports/useExportSession'
import { useDocHtmlSnapshot } from './exports/useDocHtmlSnapshot'
import { useInlineExportImages } from './exports/useInlineExportImages'
import { useHtmlPdfExport } from './exports/useHtmlPdfExport'
import { useSourceExport } from './exports/useSourceExport'
import { useDocxExport } from './exports/useDocxExport'
import { usePublishFlow } from './exports/usePublishFlow'

export type { UseExportsOptions } from './exports/types'

/**
 * 多格式导出（HTML/PDF/Markdown/pandoc/DOCX/发布）入口。
 *
 * 只负责装配：会话互斥 + DOM 快照 + 图片内联是共享基础，各格式流程按域拆分。
 * 导出期间以 ExportSession 互斥：同一时刻只允许一个导出任务，并暂停分栏预览
 * 刷新（快照依赖编辑区 DOM，与导出共用同一份 DOM）。
 *
 * 目录结构：
 * - exports/types.ts：入口参数与共享上下文类型
 * - exports/useExportSession.ts：会话互斥、独占执行、活动文档守卫
 * - exports/useDocHtmlSnapshot.ts：编辑器 DOM → 导出 HTML 模板
 * - exports/useInlineExportImages.ts：mdimg:// → base64 内联
 * - exports/useHtmlPdfExport.ts：HTML / PDF
 * - exports/useSourceExport.ts：Markdown / Pandoc
 * - exports/useDocxExport.ts：Word
 * - exports/usePublishFlow.ts：资源包发布 / 富文本复制
 */
export function useExports({
  editorRef,
  docTitle,
  activeFileId,
  activeFileIdRef,
  contents,
  dirOfFile,
  setToast,
  exportCss = null,
  resolveCollectionEntries,
}: UseExportsOptions): {
  handleExportHtml: () => Promise<void>
  handleDoExportPdf: (options: PdfOptions) => Promise<void>
  handleExportMarkdown: () => Promise<void>
  handleExportPandoc: () => Promise<void>
  handleExportDocx: () => Promise<void>
  /** 发布：导出 HTML 资源包（index.html + assets/） */
  handlePublishBundle: (options: PublishOptions, scope?: PublishScope) => Promise<void>
  /** 发布：复制富文本（text/html + text/plain） */
  handleCopyRichText: (options: PublishOptions) => Promise<void>
  /** 导出进行中（供预览同步等外部功能感知） */
  isExportActive: () => boolean
} {
  const { exportSessionRef, isExportActive } = useExportSession()
  const { buildDocHtml, buildPublishedHtml } = useDocHtmlSnapshot({
    editorRef,
    docTitle,
    exportCss,
  })
  const { inlineImagesInHtml } = useInlineExportImages()

  const { handleExportHtml, handleDoExportPdf } = useHtmlPdfExport({
    editorRef,
    activeFileIdRef,
    setToast,
    docTitle,
    exportSessionRef,
    buildDocHtml,
    inlineImagesInHtml,
  })

  const { handleExportMarkdown, handleExportPandoc } = useSourceExport({
    editorRef,
    docTitle,
    activeFileId,
    contents,
    dirOfFile,
    setToast,
  })

  const { handleExportDocx } = useDocxExport({
    editorRef,
    activeFileIdRef,
    setToast,
    docTitle,
    exportSessionRef,
    buildDocHtml,
    inlineImagesInHtml,
  })

  const { handlePublishBundle, handleCopyRichText } = usePublishFlow({
    editorRef,
    activeFileIdRef,
    setToast,
    exportSessionRef,
    buildPublishedHtml,
    inlineImagesInHtml,
    resolveCollectionEntries,
  })

  return {
    handleExportHtml,
    handleDoExportPdf,
    handleExportMarkdown,
    handleExportPandoc,
    handleExportDocx,
    handlePublishBundle,
    handleCopyRichText,
    isExportActive,
  }
}
