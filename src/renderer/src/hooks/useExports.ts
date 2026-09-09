import { useCallback, useRef } from 'react'
import katexCss from 'katex/dist/katex.min.css?inline'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { EditorHandle } from '../components/Editor'
import type { PdfOptions } from '../components/ExportPdfDialog'
import { escapeHtmlText } from '../app/constants'
import { injectToc } from '../lib/pdf'
import { toStoredImages } from '../lib/image-path'
import { createExportSession } from '../lib/export-session'
import { buildDocxPackage } from '../lib/docx'
import {
  ExportBundleError,
  buildExportBundle,
  buildPublishHtml,
  cleanWikiLinksInHtml,
  collectExportBundle,
  type ExportAsset,
  type PublishOptions,
  type PublishScope,
} from '../lib/export-bundle'
import {
  buildCollectionHtml,
  orderCollection,
  renderMarkdownToHtml,
  type CollectionEntry,
} from '../lib/document-collection'

/** Mermaid SVG → PNG dataURL（canvas 光栅化，2x 抗锯齿；blob URL 同源不污染画布） */
const rasterizeSvgToPngDataUrl = (svgOuterHtml: string): Promise<string | null> =>
  new Promise((resolve) => {
    try {
      const blob = new Blob([svgOuterHtml], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        try {
          const width = img.naturalWidth || 600
          const height = img.naturalHeight || 400
          const scale = Math.min(2, 4000 / Math.max(width, height))
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(width * scale))
          canvas.height = Math.max(1, Math.round(height * scale))
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            URL.revokeObjectURL(url)
            resolve(null)
            return
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          URL.revokeObjectURL(url)
          resolve(canvas.toDataURL('image/png'))
        } catch {
          URL.revokeObjectURL(url)
          resolve(null)
        }
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }
      img.src = url
    } catch {
      resolve(null)
    }
  })

export interface UseExportsOptions {
  editorRef: MutableRefObject<EditorHandle | null>
  /** 当前文档标题（导出默认文件名与 HTML 页标题） */
  docTitle: string
  activeFileId: string
  /** 活动文档 id 的 ref 镜像：异步导出期间判定用户是否切换了文档 */
  activeFileIdRef: MutableRefObject<string>
  contents: Record<string, string>
  /** 求某文件所在目录（相对图片路径回写用） */
  dirOfFile: (fileId: string) => string | undefined
  setToast: Dispatch<SetStateAction<string>>
  /** 用户自定义导出模板 CSS（追加在默认样式后，可覆盖；null = 默认样式） */
  exportCss?: { name: string; content: string } | null
  /** 解析集合范围的文档条目（读盘 + 标题/顺序提取 + 图片协议转换；
   *  读取失败的文档以含 path 的错误抛出）。未提供时集合范围回退当前文档 */
  resolveCollectionEntries?: (scope: Exclude<PublishScope, { kind: 'document' }>) => Promise<CollectionEntry[]>
}

/**
 * 多格式导出（HTML/PDF/Markdown/pandoc）。
 * 导出期间以 ExportSession 互斥：同一时刻只允许一个导出任务，
 * 并暂停分栏预览刷新（快照依赖编辑区 DOM，与导出共用同一份 DOM）。
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
  // 惰性初始化：避免每帧重建导出会话闭包（仅首帧创建）
  const exportSessionRef = useRef<ReturnType<typeof createExportSession> | null>(null)
  if (!exportSessionRef.current) exportSessionRef.current = createExportSession()
  const isExportActive = useCallback(
    () => exportSessionRef.current?.isActive() ?? false,
    [],
  )

  const buildDocHtml = useCallback(
    (withToc = false) => {
      // 用编辑器真实 DOM 快照：保留 Mermaid SVG / KaTeX 渲染结果
      let body = editorRef.current?.getPreviewHtml() ?? ''
      if (withToc) body = injectToc(body)
      const title = docTitle.replace(/\.md$/, '')
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtmlText(title)}</title>
<style>
${katexCss}
</style>
<style>
body{font-family:-apple-system,'Segoe UI','PingFang SC',sans-serif;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.8;color:#1d1b18}
h1{font-size:1.9em}h2{font-size:1.4em;border-bottom:1px solid #eee;padding-bottom:.3em}h3{font-size:1.15em}
pre{background:#f5f2ee;padding:16px;border-radius:8px;overflow-x:auto}
code{font-family:Consolas,monospace;font-size:.9em}
blockquote{border-left:3px solid #7c6f5b;margin:1em 0;padding:.4em 1.2em;color:#5c5850;background:#faf8f5}
table{border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px 12px}th{background:#f5f2ee}
img{max-width:100%}
sup[data-type=footnote_reference]{color:#7c6f5b;font-weight:600}
dl[data-type=footnote_definition]{color:#5c5850;font-size:.92em;margin:.8em 0;padding:.4em .9em;border-left:2px solid #7c6f5b;background:#faf8f5;border-radius:0 6px 6px 0}
dl[data-type=footnote_definition] dt{font-weight:600;font-family:Consolas,monospace;font-size:.85em}
dl[data-type=footnote_definition] dt::before{content:'[^'}dl[data-type=footnote_definition] dt::after{content:']'}
dl[data-type=footnote_definition] dd{margin:0}
li[data-item-type=task]{list-style:none;position:relative;padding-left:27px;margin-left:-1.2rem}
li[data-item-type=task]::before{content:'';position:absolute;left:2px;top:.42em;width:15px;height:15px;box-sizing:border-box;border:1.5px solid #a89d8c;border-radius:3px}
li[data-item-type=task][data-checked=true]::before{border-color:#7c6f5b;background-color:#7c6f5b;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5 6.8 11.8 12.5 4.5' fill='none' stroke='%23fff' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-size:13px 13px;background-position:center;background-repeat:no-repeat}
.doc-toc{page-break-after:always}
.doc-toc-title{font-size:1.3em;font-weight:700;margin-bottom:.6em}
.doc-toc-list{list-style:none;padding-left:0;line-height:2}
.doc-toc-list a{color:inherit;text-decoration:none}
.toc-l2{padding-left:1.2em}.toc-l3{padding-left:2.4em;font-size:.94em}
</style>
${exportCss?.content ? `<style>\n${exportCss.content}\n</style>` : ''}
</head>
<body>${body}</body>
</html>`
    },
    [docTitle, editorRef, exportCss],
  )

  /** 导出预处理：把 mdimg 本地图片内联为 base64，导出的 HTML/PDF 自包含可移植。
   *  返回失败张数（文件被删/目录外等无法读取的图片保留原路径，
   *  不静默丢失——调用方在成功 toast 中提示） */
  const inlineImagesInHtml = useCallback(
    async (html: string): Promise<{ html: string; failed: number }> => {
      const imgRe = /<img\s+[^>]*src="([^"]+)"[^>]*>/g
      const srcs: string[] = []
      let m: RegExpExecArray | null
      while ((m = imgRe.exec(html)) !== null) {
        if (m[1].startsWith('mdimg://')) srcs.push(m[1])
      }
      let result = html
      let failed = 0
      for (const src of srcs) {
        try {
          // Y-M2：渲染层 fetch(mdimg://) 被 Blink 拒绝（自定义 scheme 不参与 fetch
          // 规范，必然 TypeError），内联必须走主进程只读 IPC（同一信任校验）
          const res = await window.desktopAPI?.document.readImageInline(src)
          if (!res?.ok || !res.data?.dataUrl) {
            failed++
            continue
          }
          result = result.split(src).join(res.data.dataUrl)
        } catch {
          failed++
        }
      }
      return { html: result, failed }
    },
    [],
  )

  const handleExportHtml = useCallback(async () => {
    if (!window.desktopAPI) return
    if (!exportSessionRef.current!.begin()) {
      setToast('已有导出任务正在进行')
      return
    }
    try {
      const title = docTitle.replace(/\.md$/, '')
      // B1：导出前强制等待 KaTeX/Mermaid 懒加载插件就绪，确保快照含渲染结果
      setToast('导出中：等待公式/图表渲染…')
      // E-X：等待期间用户可能切换标签——buildDocHtml 用编辑器实时 DOM 快照
      // + 闭包 docTitle，切换后导出的是新文档内容配旧文档标题。捕获起始
      // 活动文件，等待结束仍不一致时中止并提示
      const exportFileId = activeFileIdRef.current
      await editorRef.current?.ensureRichContent()
      if (activeFileIdRef.current !== exportFileId) {
        setToast('导出期间切换了文档，已取消，请重新导出')
        return
      }
      const { html, failed } = await inlineImagesInHtml(buildDocHtml())
      const res = await window.desktopAPI.document.saveAs(html, {
        filters: [{ name: 'HTML', extensions: ['html'] }],
        defaultPath: `${title}.html`,
      })
      if (res.ok)
        setToast(failed > 0 ? `HTML 已导出（${failed} 张图片未能内联，其它设备可能无法显示）` : 'HTML 已导出')
      else if (res.error?.code !== 'CANCELLED') setToast('HTML 导出失败，请检查文件权限或磁盘空间')
    } catch {
      setToast('HTML 导出失败，请稍后重试')
    } finally {
      editorRef.current?.restoreExportViewport()
      exportSessionRef.current!.finish()
    }
  }, [docTitle, editorRef, buildDocHtml, inlineImagesInHtml, setToast, activeFileIdRef])

  /** 确认选项后执行 PDF 导出（选项弹窗由调用方关闭） */
  const handleDoExportPdf = useCallback(
    async (options: PdfOptions) => {
      if (!window.desktopAPI) return
      if (!exportSessionRef.current!.begin()) {
        setToast('已有导出任务正在进行')
        return
      }
      try {
        const title = docTitle.replace(/\.md$/, '')
        // B1：先等富内容渲染完成
        setToast('导出中：等待公式/图表渲染…')
        // E-X：等待期间用户可能切换标签，导出内容与标题错配（同 handleExportHtml）
        const exportFileId = activeFileIdRef.current
        await editorRef.current?.ensureRichContent()
        if (activeFileIdRef.current !== exportFileId) {
          setToast('导出期间切换了文档，已取消，请重新导出')
          return
        }
        const { html, failed } = await inlineImagesInHtml(buildDocHtml(options.toc === true))
        const res = await window.desktopAPI.document.exportPdf(
          html,
          `${title}.pdf`,
          options,
        )
        if (res.ok)
          setToast(failed > 0 ? `PDF 导出成功（${failed} 张图片未能内联，其它设备可能无法显示）` : 'PDF 导出成功')
        else if (res.error?.code !== 'CANCELLED') setToast('PDF 导出失败，请检查文件权限或磁盘空间')
      } catch {
        setToast('PDF 导出失败，请稍后重试')
      } finally {
        // ensureRichContent 置位的全量视口覆盖在切换标签提前返回、
        // getPreviewHtml 之前抛错等路径上不会自行复位，统一在此恢复
        editorRef.current?.restoreExportViewport()
        exportSessionRef.current!.finish()
      }
    },
    [docTitle, editorRef, buildDocHtml, inlineImagesInHtml, setToast, activeFileIdRef],
  )

  /** 导出 Markdown：把当前文档另存为新的 .md 文件 */
  const handleExportMarkdown = useCallback(async () => {
    if (!window.desktopAPI) return
    try {
      const title = docTitle.replace(/\.md$/, '')
      // A-L1：与 handleSave 一致，读编辑器实时内容（防抖窗口内 state 滞后）
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
      // A-L1：与 handleSave 一致，读编辑器实时内容（防抖窗口内 state 滞后）
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

  /** 零依赖导出 Word：编辑器 DOM 快照 → OOXML 部件 → 主进程打包 .docx。
   *  Mermaid SVG 在渲染进程经 canvas 光栅化为 PNG 内嵌；失败回退占位文本 */
  const handleExportDocx = useCallback(async () => {
    if (!window.desktopAPI) return
    if (!exportSessionRef.current!.begin()) {
      setToast('已有导出任务正在进行')
      return
    }
    try {
      const title = docTitle.replace(/\.md$/, '')
      setToast('导出中：等待公式/图表渲染…')
      const exportFileId = activeFileIdRef.current
      await editorRef.current?.ensureRichContent()
      if (activeFileIdRef.current !== exportFileId) {
        setToast('导出期间切换了文档，已取消，请重新导出')
        return
      }
      const { html, failed } = await inlineImagesInHtml(buildDocHtml())
      const { pkg, stats } = await buildDocxPackage(html, title, {
        rasterizeSvg: rasterizeSvgToPngDataUrl,
      })
      const res = await window.desktopAPI.document.exportDocx(
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
    } catch {
      setToast('Word 导出失败，请稍后重试')
    } finally {
      editorRef.current?.restoreExportViewport()
      exportSessionRef.current!.finish()
    }
  }, [docTitle, editorRef, buildDocHtml, inlineImagesInHtml, setToast, activeFileIdRef])

  /** 组装发布 HTML：清理 Wiki 链接 → 注入目录 → 模板样式（正文内容不变）。
   *  集合模式传入 bodyOverride/titleOverride，不使用编辑器 DOM 快照 */
  const buildPublishedHtml = useCallback(
    async (options: PublishOptions, override?: { body: string; title: string }): Promise<string> => {
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

  /** 发布：导出 HTML 资源包。目录选择独立进行——用户取消不产生任何写入。
   *  范围为目录/标签集合时由 resolveCollectionEntries 读盘收集并合并为单文档 */
  const handlePublishBundle = useCallback(
    async (options: PublishOptions, scope: PublishScope = { kind: 'document' }) => {
      if (!window.desktopAPI) return
      if (!exportSessionRef.current!.begin()) {
        setToast('已有导出任务正在进行')
        return
      }
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
          const exportFileId = activeFileIdRef.current
          await editorRef.current?.ensureRichContent()
          if (activeFileIdRef.current !== exportFileId) {
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
        const pick = await window.desktopAPI.document.pickExportDirectory('选择资源包导出位置')
        if (!pick.ok || !pick.data) return
        const result = await buildExportBundle(finalHtml, assets, pick.data.path, {
          writeBundle: (request) => window.desktopAPI!.document.exportBundle(request),
        })
        const sizeMb = (result.bytes / 1024 / 1024).toFixed(1)
        setToast(`资源包已导出（${result.assetCount} 张图片，共 ${sizeMb} MB）`)
      } catch (error) {
        if (error instanceof ExportBundleError) setToast(`导出失败：${error.message}`)
        else setToast('导出失败，请稍后重试')
      } finally {
        editorRef.current?.restoreExportViewport()
        exportSessionRef.current!.finish()
      }
    },
    [activeFileIdRef, buildPublishedHtml, editorRef, inlineImagesInHtml, resolveCollectionEntries, setToast],
  )

  /** 发布：复制富文本（text/html + text/plain）。不把原始 HTML 写入正文 */
  const handleCopyRichText = useCallback(
    async (options: PublishOptions) => {
      if (!window.desktopAPI) return
      if (!exportSessionRef.current!.begin()) {
        setToast('已有导出任务正在进行')
        return
      }
      try {
        setToast('复制中：等待公式/图表渲染…')
        const exportFileId = activeFileIdRef.current
        await editorRef.current?.ensureRichContent()
        if (activeFileIdRef.current !== exportFileId) {
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
      } catch {
        setToast('复制失败，请稍后重试')
      } finally {
        editorRef.current?.restoreExportViewport()
        exportSessionRef.current!.finish()
      }
    },
    [activeFileIdRef, buildPublishedHtml, editorRef, inlineImagesInHtml, setToast],
  )

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
