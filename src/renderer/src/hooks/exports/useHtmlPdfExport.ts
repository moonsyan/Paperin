import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import type { EditorHandle } from '../../components/Editor'
import type { PdfOptions } from '../../components/ExportPdfDialog'
import {
  awaitRichContentForExport,
  runExclusiveExport,
} from './useExportSession'
import type { createExportSession } from '../../lib/export-session'
import type { Dispatch, SetStateAction } from 'react'

type ExportSession = ReturnType<typeof createExportSession>

/**
 * HTML / PDF 导出。两条流程共享同一份"抓 DOM 快照 → 内联 mdimg → 落盘"骨架，
 * 差别只在最终 IPC 通道（saveAs vs exportPdf）与是否注入目录。
 *
 * 抽成独立 hook 的原因：它们与其他导出流程（Markdown/Pandoc 走源文本、DOCX
 * 走 OOXML 打包、Publish 走资源包）没有共同的落盘方式，硬塞进一个 hook 会
 * 让依赖数组与失败分支互相污染。
 */
export function useHtmlPdfExport({
  editorRef,
  activeFileIdRef,
  setToast,
  docTitle,
  exportSessionRef,
  buildDocHtml,
  inlineImagesInHtml,
}: {
  editorRef: MutableRefObject<EditorHandle | null>
  activeFileIdRef: MutableRefObject<string>
  setToast: Dispatch<SetStateAction<string>>
  docTitle: string
  exportSessionRef: MutableRefObject<ExportSession | null>
  buildDocHtml: (withToc?: boolean) => string
  inlineImagesInHtml: (html: string) => Promise<{ html: string; failed: number }>
}) {
  const handleExportHtml = useCallback(async () => {
    if (!window.desktopAPI) return
    const session = exportSessionRef.current
    if (!session) return
    await runExclusiveExport(session, editorRef, setToast, 'HTML 导出失败，请稍后重试', async () => {
      const title = docTitle.replace(/\.md$/, '')
      // B1：导出前强制等待 KaTeX/Mermaid 懒加载插件就绪，确保快照含渲染结果
      setToast('导出中：等待公式/图表渲染…')
      // E-X：等待期间用户可能切换标签——buildDocHtml 用编辑器实时 DOM 快照
      // + 闭包 docTitle，切换后导出的是新文档内容配旧文档标题。捕获起始
      // 活动文件，等待结束仍不一致时中止并提示
      if (!(await awaitRichContentForExport(editorRef, activeFileIdRef))) {
        setToast('导出期间切换了文档，已取消，请重新导出')
        return
      }
      const { html, failed } = await inlineImagesInHtml(buildDocHtml())
      const res = await window.desktopAPI!.document.saveAs(html, {
        filters: [{ name: 'HTML', extensions: ['html'] }],
        defaultPath: `${title}.html`,
      })
      if (res.ok)
        setToast(failed > 0 ? `HTML 已导出（${failed} 张图片未能内联，其它设备可能无法显示）` : 'HTML 已导出')
      else if (res.error?.code !== 'CANCELLED') setToast('HTML 导出失败，请检查文件权限或磁盘空间')
    })
  }, [activeFileIdRef, buildDocHtml, docTitle, editorRef, exportSessionRef, inlineImagesInHtml, setToast])

  /** 确认选项后执行 PDF 导出（选项弹窗由调用方关闭） */
  const handleDoExportPdf = useCallback(
    async (options: PdfOptions) => {
      if (!window.desktopAPI) return
      const session = exportSessionRef.current
      if (!session) return
      await runExclusiveExport(session, editorRef, setToast, 'PDF 导出失败，请稍后重试', async () => {
        const title = docTitle.replace(/\.md$/, '')
        // B1：先等富内容渲染完成
        setToast('导出中：等待公式/图表渲染…')
        // E-X：等待期间用户可能切换标签，导出内容与标题错配（同 handleExportHtml）
        if (!(await awaitRichContentForExport(editorRef, activeFileIdRef))) {
          setToast('导出期间切换了文档，已取消，请重新导出')
          return
        }
        const { html, failed } = await inlineImagesInHtml(buildDocHtml(options.toc === true))
        const res = await window.desktopAPI!.document.exportPdf(
          html,
          `${title}.pdf`,
          options,
        )
        if (res.ok)
          setToast(failed > 0 ? `PDF 导出成功（${failed} 张图片未能内联，其它设备可能无法显示）` : 'PDF 导出成功')
        else if (res.error?.code !== 'CANCELLED') setToast('PDF 导出失败，请检查文件权限或磁盘空间')
      })
    },
    [activeFileIdRef, buildDocHtml, docTitle, editorRef, exportSessionRef, inlineImagesInHtml, setToast],
  )

  return { handleExportHtml, handleDoExportPdf }
}
