import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { EditorHandle } from '../../components/Editor'
import type { createExportSession } from '../../lib/export-session'
import {
  awaitRichContentForExport,
  runExclusiveExport,
} from './useExportSession'

type ExportSession = ReturnType<typeof createExportSession>

/**
 * 零依赖 Word 导出：编辑器 DOM 快照 → OOXML 部件 → 主进程打包 .docx。
 * Mermaid SVG 在渲染进程经 canvas 光栅化为 PNG 内嵌；失败回退占位文本。
 *
 * 独立成 hook 的原因：DOCX 是唯一需要 SVG 位图化的流程，且 stats.skippedSvg
 * 需要在成功 Toast 里单独汇报，与 HTML/PDF 的失败张数语义不同。
 *
 * `lib/docx`（613 行 OOXML 生成）与 `lib/svg-rasterize` 只服务这条链路，
 * 因此改为执行时动态 import：它们不再进入首屏主包，只有真正导出 Word 时才加载。
 */
export function useDocxExport({
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
  const handleExportDocx = useCallback(async () => {
    if (!window.desktopAPI) return
    const session = exportSessionRef.current
    if (!session) return
    await runExclusiveExport(session, editorRef, setToast, 'Word 导出失败，请稍后重试', async () => {
      const title = docTitle.replace(/\.md$/, '')
      setToast('导出中：等待公式/图表渲染…')
      if (!(await awaitRichContentForExport(editorRef, activeFileIdRef))) {
        setToast('导出期间切换了文档，已取消，请重新导出')
        return
      }
      const { html, failed } = await inlineImagesInHtml(buildDocHtml())
      const [{ buildDocxPackage }, { rasterizeSvgToPngDataUrl }] = await Promise.all([
        import('../../lib/docx'),
        import('../../lib/svg-rasterize'),
      ])
      const { pkg, stats } = await buildDocxPackage(html, title, {
        rasterizeSvg: rasterizeSvgToPngDataUrl,
      })
      const res = await window.desktopAPI!.document.exportDocx(
        pkg.parts,
        pkg.media,
        `${title}.docx`,
      )
      if (res.ok) {
        const notes: string[] = []
        if (failed > 0) notes.push(`${failed} 张图片未能内联`)
        if (stats.skippedSvg > 0) notes.push(`${stats.skippedSvg} 个图表转为占位文本`)
        setToast(notes.length > 0 ? `Word 已导出（${notes.join('，')}）` : 'Word 已导出')
      } else if (res.error?.code !== 'CANCELLED') {
        setToast(res.error?.message ? `Word 导出失败：${res.error.message}` : 'Word 导出失败，请稍后重试')
      }
    })
  }, [activeFileIdRef, buildDocHtml, docTitle, editorRef, exportSessionRef, inlineImagesInHtml, setToast])

  return { handleExportDocx }
}
