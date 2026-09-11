import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import type { EditorHandle } from '../../components/Editor'
import { toStoredImages } from '../../lib/image-path'
import type { Dispatch, SetStateAction } from 'react'

/**
 * Markdown / Pandoc 源文件导出。
 *
 * 两条流程与其他导出的关键差异：读的是编辑器实时 Markdown（不是 DOM 快照），
 * 因此不需要 ensureRichContent，也不占用导出会话互斥——用户可以在等待
 * Pandoc 转换时继续编辑。图片协议在此处走 toStoredImages 回写相对路径，
 * 与 handleSave 语义保持一致。
 *
 * A-L1：读编辑器实时内容（防抖窗口内 state 滞后）。
 */
export function useSourceExport({
  editorRef,
  docTitle,
  activeFileId,
  contents,
  dirOfFile,
  setToast,
}: {
  editorRef: MutableRefObject<EditorHandle | null>
  docTitle: string
  activeFileId: string
  contents: Record<string, string>
  dirOfFile: (fileId: string) => string | undefined
  setToast: Dispatch<SetStateAction<string>>
}) {
  /** 导出 Markdown：把当前文档另存为新的 .md 文件 */
  const handleExportMarkdown = useCallback(async () => {
    if (!window.desktopAPI) return
    try {
      const title = docTitle.replace(/\.md$/, '')
      const editorMd = editorRef.current?.isReady() ? editorRef.current.getMarkdown() : null
      const content =
        editorMd != null
          ? toStoredImages(editorMd, dirOfFile(activeFileId))
          : (contents[activeFileId] ?? '')
      // 默认名加"-导出"后缀，避免与同名源文件混淆直接覆盖
      const res = await window.desktopAPI.document.saveAs(content, {
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        defaultPath: `${title}-导出.md`,
      })
      if (res.ok) setToast('Markdown 已导出')
      else if (res.error?.code !== 'CANCELLED') setToast('Markdown 导出失败，请检查文件权限或磁盘空间')
    } catch {
      setToast('Markdown 导出失败，请稍后重试')
    }
  }, [docTitle, editorRef, contents, activeFileId, dirOfFile, setToast])

  /** pandoc 多格式导出（Word/EPUB/LaTeX/纯文本）；未安装 pandoc 时提示安装 */
  const handleExportPandoc = useCallback(async () => {
    if (!window.desktopAPI) return
    try {
      const title = docTitle.replace(/\.md$/, '')
      const editorMd = editorRef.current?.isReady() ? editorRef.current.getMarkdown() : null
      const content =
        editorMd != null
          ? toStoredImages(editorMd, dirOfFile(activeFileId))
          : (contents[activeFileId] ?? '')
      const res = await window.desktopAPI.document.exportPandoc(content, title)
      if (res.ok) setToast('导出成功')
      else if (res.error?.code === 'PANDOC_NOT_FOUND') {
        setToast('未检测到 pandoc：请先安装（pandoc.org）后重启应用')
      } else if (res.error?.code !== 'CANCELLED') {
        setToast(`导出失败：${res.error?.message ?? ''}`)
      }
    } catch {
      setToast('导出失败，请稍后重试')
    }
  }, [docTitle, editorRef, contents, activeFileId, dirOfFile, setToast])

  return { handleExportMarkdown, handleExportPandoc }
}
