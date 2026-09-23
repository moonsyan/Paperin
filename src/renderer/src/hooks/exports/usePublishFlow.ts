import { useCallback, useRef } from 'react'
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
  DELIVERY_REPORT_FILE_NAME,
  serializeDeliveryReport,
} from '../../lib/delivery-report'
import type { DeliveryReport } from '../../lib/delivery-report'
import {
  buildCollectionHtml,
  orderCollection,
  renderMarkdownToHtml,
  type CollectionEntry,
} from '../../lib/document-collection'
import { toStoredImages } from '../../lib/image-path'
import type { createExportSession } from '../../lib/export-session'
import {
  awaitRichContentForExport,
  runExclusiveExport,
} from './useExportSession'
import {
  directoryOfAbsolutePath,
  readExportSource,
  reviewExportMarkdown,
  reviewExportMarkdownDocuments,
} from './review-export'

type ExportSession = ReturnType<typeof createExportSession>

/**
 * 发布流程：资源包导出 + 富文本复制。
 *
 * 与 HTML/PDF/DOCX 的关键差异：
 * - 支持三种范围（当前文档 / 目录集合 / 标签集合），集合模式不用 DOM 快照，
 *   改由 resolveCollectionEntries 读盘 + renderMarkdownToHtml 拼接；
 * - 目录选择独立进行——用户取消不产生任何写入；
 * - 富文本复制不写文件，只走剪贴板，失败时回退 Markdown 纯文本。
 *
 * 写出前与 Markdown/HTML 共用 reviewExportMarkdown（空图、危险 URL、缺附件确认）。
 * 单文档：富内容就绪后再预检，避免等待期间改链导致预检与写出不一致。
 * 集合：按条目绝对路径取目录，预检用 toStoredImages（跳过 mdimg），缺附件一次确认。
 */
export function usePublishFlow({
  editorRef,
  activeFileIdRef,
  contents,
  dirOfFile,
  setToast,
  exportSessionRef,
  buildPublishedHtml,
  inlineImagesInHtml,
  resolveCollectionEntries,
  getDeliveryReport,
}: {
  editorRef: MutableRefObject<EditorHandle | null>
  activeFileIdRef: MutableRefObject<string>
  contents: Record<string, string>
  dirOfFile: (fileId: string) => string | undefined
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
  getDeliveryReport?: () => DeliveryReport
}) {
  const getDeliveryReportRef = useRef(getDeliveryReport)
  getDeliveryReportRef.current = getDeliveryReport

  const reviewActiveDocument = useCallback(async () => {
    const fileId = activeFileIdRef.current
    const directory = dirOfFile(fileId)
    const content = readExportSource({
      editorMarkdown: editorRef.current?.isReady() ? editorRef.current.getMarkdown() : null,
      fallback: contents[fileId] ?? '',
      directory,
    })
    return reviewExportMarkdown({
      content,
      directory,
      stat: window.desktopAPI ? (path) => window.desktopAPI!.document.stat(path) : null,
      notify: setToast,
      confirm: (message) => window.confirm(message),
    })
  }, [activeFileIdRef, contents, dirOfFile, editorRef, setToast])

  const reviewCollectionEntries = useCallback(
    async (entries: CollectionEntry[]) => {
      return reviewExportMarkdownDocuments({
        documents: entries.map((entry) => {
          const directory = directoryOfAbsolutePath(entry.path)
          return {
            content: toStoredImages(entry.content, directory),
            directory,
            label: entry.title,
          }
        }),
        stat: window.desktopAPI ? (path) => window.desktopAPI!.document.stat(path) : null,
        notify: setToast,
        confirm: (message) => window.confirm(message),
      })
    },
    [setToast],
  )

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
            if (!resolveCollectionEntries) {
              setToast('当前模式不支持集合导出')
              return
            }
            setToast('集合导出：正在读取文档…')
            let entries: CollectionEntry[]
            try {
              entries = orderCollection(await resolveCollectionEntries(scope))
            } catch (error) {
              const message = error instanceof Error ? error.message : '集合导出失败'
              setToast(message.includes('索引不完整') ? message : `集合导出失败：${message}`)
              return
            }
            if (entries.length === 0) {
              setToast('集合范围内没有可发布的文档')
              return
            }
            const review = await reviewCollectionEntries(entries)
            if (!review.ok) return
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
            const review = await reviewActiveDocument()
            if (!review.ok) return
            html = await buildPublishedHtml(options)
          }
          let finalHtml = html
          let assets: ExportAsset[] = []
          if (options.inlineImages) {
            const { html: inlined, failed } = await inlineImagesInHtml(html)
            if (failed > 0) {
              setToast(`${failed} 张本地图片无法读取，已取消导出`)
              return
            }
            finalHtml = inlined
          } else {
            const bundle = await collectExportBundle(html, async (src) => {
              const res = await window.desktopAPI!.document.readImageInline(src)
              return res?.ok ? res.data?.dataUrl ?? null : null
            })
            if (bundle.failedSources.length > 0) {
              setToast(`${bundle.failedSources.length} 张本地图片无法读取，已取消导出`)
              return
            }
            finalHtml = bundle.html
            assets = bundle.assets
          }
          const pick = await window.desktopAPI!.document.pickExportDirectory('选择资源包导出位置')
          if (!pick.ok || !pick.data) return
          const deliveryReport = getDeliveryReportRef.current?.()
          const result = await buildExportBundle(finalHtml, assets, pick.data.path, {
            writeBundle: (request) => window.desktopAPI!.document.exportBundle(request),
            report: deliveryReport
              ? { fileName: DELIVERY_REPORT_FILE_NAME, json: serializeDeliveryReport(deliveryReport) }
              : undefined,
          })
          const sizeMb = (result.bytes / 1024 / 1024).toFixed(1)
          setToast(`资源包已导出（${result.assetCount} 张图片，共 ${sizeMb} MB）`)
        } catch (error) {
          if (error instanceof ExportBundleError) setToast(`导出失败：${error.message}`)
          else throw error
        }
      })
    },
    [
      activeFileIdRef,
      buildPublishedHtml,
      editorRef,
      exportSessionRef,
      inlineImagesInHtml,
      resolveCollectionEntries,
      reviewActiveDocument,
      reviewCollectionEntries,
      setToast,
    ],
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
        const review = await reviewActiveDocument()
        if (!review.ok) return
        const html = await buildPublishedHtml(options)
        const { html: inlined, failed } = await inlineImagesInHtml(html)
        if (failed > 0) {
          setToast(`${failed} 张本地图片无法读取，已取消复制`)
          return
        }
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
    [
      activeFileIdRef,
      buildPublishedHtml,
      editorRef,
      exportSessionRef,
      inlineImagesInHtml,
      reviewActiveDocument,
      setToast,
    ],
  )

  return { handlePublishBundle, handleCopyRichText }
}
