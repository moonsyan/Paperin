import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { EditorHandle } from '../../components/Editor'
import {
  ExportBundleError,
  buildExportBundle,
  collectExportBundle,
  type ExportAsset,
  type PublishOptions,
  type PublishScope,
} from '../../lib/export-bundle'
import {
  buildCollectionHtml,
  orderCollection,
  renderMarkdownToHtml,
  type CollectionEntry,
} from '../../lib/document-collection'
import type { createExportSession } from '../../lib/export-session'
import {
  awaitRichContentForExport,
  runExclusiveExport,
} from './useExportSession'

type ExportSession = ReturnType<typeof createExportSession>

/**
 * 发布流程：资源包导出 + 富文本复制。
 *
 * 与 HTML/PDF/DOCX 的关键差异：
 * - 支持三种范围（当前文档 / 目录集合 / 标签集合），集合模式不用 DOM 快照，
 *   改由 resolveCollectionEntries 读盘 + renderMarkdownToHtml 拼接；
 * - 目录选择独立进行——用户取消不产生任何写入；
 * - 富文本复制不写文件，只走剪贴板，失败时回退 Markdown 纯文本。
 */
export function usePublishFlow({
  editorRef,
  activeFileIdRef,
  setToast,
  exportSessionRef,
  buildPublishedHtml,
  inlineImagesInHtml,
  resolveCollectionEntries,
}: {
  editorRef: MutableRefObject<EditorHandle | null>
  activeFileIdRef: MutableRefObject<string>
  setToast: Dispatch<SetStateAction<string>>
  exportSessionRef: MutableRefObject<ExportSession | null>
  buildPublishedHtml: (
    options: PublishOptions,
    override?: { body: string; title: string },
  ) => Promise<string>
  inlineImagesInHtml: (html: string) => Promise<{ html: string; failed: number }>
  resolveCollectionEntries?: (
    scope: Exclude<PublishScope, { kind: 'document' }>,
  ) => Promise<CollectionEntry[]>
}) {
  /** 发布：导出 HTML 资源包。目录选择独立进行——用户取消不产生任何写入。
   *  范围为目录/标签集合时由 resolveCollectionEntries 读盘收集并合并为单文档 */
  const handlePublishBundle = useCallback(
    async (options: PublishOptions, scope: PublishScope = { kind: 'document' }) => {
      if (!window.desktopAPI) return
      const session = exportSessionRef.current
      if (!session) return
      await runExclusiveExport(session, editorRef, setToast, '导出失败，请稍后重试', async () => {
        try {
          let html: string
          if (scope.kind !== 'document') {
            // 集合模式：不用编辑器 DOM 快照，直接按文档内容渲染合并
            if (!resolveCollectionEntries) {
              setToast('当前模式不支持集合导出')
              return
            }
            setToast('集合导出：正在读取文档…')
            const entries = orderCollection(await resolveCollectionEntries(scope))
            if (entries.length === 0) {
              setToast('集合范围内没有可发布的文档')
              return
            }
            const body = buildCollectionHtml(
              entries.map((entry) => ({ ...entry, content: renderMarkdownToHtml(entry.content) })),
            )
            const title =
              scope.kind === 'tag' ? `标签「${scope.tag}」合集` : '目录合集'
            html = await buildPublishedHtml(options, { body, title })
          } else {
            setToast('导出中：等待公式/图表渲染…')
            if (!(await awaitRichContentForExport(editorRef, activeFileIdRef))) {
              setToast('导出期间切换了文档，已取消，请重新导出')
              return
            }
            html = await buildPublishedHtml(options)
          }
          let finalHtml = html
          let assets: ExportAsset[] = []
          if (options.inlineImages) {
            // 内联模式：单文件自包含，不写 assets/
            const { html: inlined } = await inlineImagesInHtml(html)
            finalHtml = inlined
          } else {
            const bundle = await collectExportBundle(html, async (src) => {
              const res = await window.desktopAPI!.document.readImageInline(src)
              return res?.ok ? res.data?.dataUrl ?? null : null
            })
            // 缺失图片显式失败：不静默丢图，让用户修复后重试
            if (bundle.failedSources.length > 0) {
              setToast(`${bundle.failedSources.length} 张本地图片无法读取，已取消导出`)
              return
            }
            finalHtml = bundle.html
            assets = bundle.assets
          }
          const pick = await window.desktopAPI!.document.pickExportDirectory('选择资源包导出位置')
          if (!pick.ok || !pick.data) return
          const result = await buildExportBundle(finalHtml, assets, pick.data.path, {
            writeBundle: (request) => window.desktopAPI!.document.exportBundle(request),
          })
          const sizeMb = (result.bytes / 1024 / 1024).toFixed(1)
          setToast(`资源包已导出（${result.assetCount} 张图片，共 ${sizeMb} MB）`)
        } catch (error) {
          // ExportBundleError 携带体积/写入等具体信息，比兜底文案更有用
          if (error instanceof ExportBundleError) setToast(`导出失败：${error.message}`)
          else throw error
        }
      })
    },
    [activeFileIdRef, buildPublishedHtml, editorRef, exportSessionRef, inlineImagesInHtml, resolveCollectionEntries, setToast],
  )

  /** 发布：复制富文本（text/html + text/plain）。不把原始 HTML 写入正文 */
  const handleCopyRichText = useCallback(
    async (options: PublishOptions) => {
      if (!window.desktopAPI) return
      const session = exportSessionRef.current
      if (!session) return
      await runExclusiveExport(session, editorRef, setToast, '复制失败，请稍后重试', async () => {
        setToast('复制中：等待公式/图表渲染…')
        if (!(await awaitRichContentForExport(editorRef, activeFileIdRef))) {
          setToast('复制期间切换了文档，已取消，请重新操作')
          return
        }
        const html = await buildPublishedHtml(options)
        // 粘贴环境通常会剥离外链样式：富文本始终内联图片
        const { html: inlined } = await inlineImagesInHtml(html)
        const editorMd = editorRef.current?.isReady() ? editorRef.current.getMarkdown() : null
        const plain = editorMd ?? ''
        try {
          const item = new ClipboardItem({
            'text/html': new Blob([inlined], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          })
          await navigator.clipboard.write([item])
          setToast('已复制富文本，可直接粘贴到公众号等编辑器')
        } catch {
          await navigator.clipboard.writeText(plain)
          setToast('富文本复制失败，已复制 Markdown 纯文本')
        }
      })
    },
    [activeFileIdRef, buildPublishedHtml, editorRef, exportSessionRef, inlineImagesInHtml, setToast],
  )

  return { handlePublishBundle, handleCopyRichText }
}
