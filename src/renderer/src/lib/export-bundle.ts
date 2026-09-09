/* ==================== HTML 资源包导出与发布模板 ====================
 *
 * 资源包 = index.html + assets/：本地图片（mdimg://）改写为 assets/ 相对
 * 路径并写为文件，HTML 不再依赖 base64 内联，可独立打开、便于托管与 diff。
 * 目录选择在调用 buildExportBundle 之前完成（独立 IPC），因此取消不会
 * 产生任何写入；写盘由主进程在临时目录完成后原子重命名，失败不残留半成品。
 *
 * 模板（blog/technical/paper/wechat）只改变导出 CSS、标题页与目录选项，
 * 不改动正文内容；微信模板假设粘贴环境会剥离外链样式，默认整体内联。
 */

export interface ExportAsset {
  source: string
  data: Uint8Array
  fileName: string
}

export interface ExportBundleResult {
  path: string
  assetCount: number
  bytes: number
}

export type PublishTemplate = 'blog' | 'technical' | 'paper' | 'wechat'

export interface PublishOptions {
  template: PublishTemplate
  includeToc: boolean
  inlineImages: boolean
  cleanWikiLinks: boolean
}

/** 发布范围：当前文档 / 当前目录集合 / 按标签集合 */
export type PublishScope =
  | { kind: 'document' }
  | { kind: 'directory' }
  | { kind: 'tag'; tag: string }

/** 体积上限：单资源 20MB、总量 100MB、HTML 10MB（主进程同口径校验） */
export const MAX_BUNDLE_ASSET_BYTES = 20 * 1024 * 1024
export const MAX_BUNDLE_TOTAL_BYTES = 100 * 1024 * 1024
export const MAX_BUNDLE_HTML_BYTES = 10 * 1024 * 1024

export class ExportBundleError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

const MDIMG_SRC_RE = /src="(mdimg:\/\/[^"]+)"/g
const ALLOWED_IMAGE_MIME = /^image\/(png|jpeg|jpg|gif|webp|bmp|svg\+xml)$/

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
}

/** djb2 哈希：由来源路径派生稳定文件名（不含路径分隔符与用户可读名） */
const hashSource = (source: string): string => {
  let hash = 5381
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** 解析 dataURL 为导出资源；非图片 MIME 或格式非法返回 null */
export const dataUrlToExportAsset = (source: string, dataUrl: string): ExportAsset | null => {
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl)
  if (!match) return null
  const mime = match[1].toLowerCase()
  if (!ALLOWED_IMAGE_MIME.test(mime)) return null
  const ext = MIME_EXT[mime] ?? 'png'
  try {
    const binary = atob(match[2])
    const data = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i)
    return { source, data, fileName: `img-${hashSource(source)}.${ext}` }
  } catch {
    return null
  }
}

/** 把 HTML 中 <img src="..."> 的来源按映射改写为资源包相对路径 */
export const rewriteBundleHtml = (html: string, mapping: ReadonlyMap<string, string>): string => {
  let result = html
  // 长 source 优先替换：短 source 是长 source 的前缀时（a.png 与 a.png2.png），
  // 先替换短串会截断长串的 URL，使其后续映射失配、资源 404
  const sources = Array.from(mapping.keys()).sort((a, b) => b.length - a.length)
  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const source of sources) {
    const target = mapping.get(source) ?? ''
    // 替换串里的 $ 有特殊含义（$&、$1），资源路径含 $ 时必须转义
    const safeTarget = target.replace(/\$/g, '$$$$')
    const pattern = new RegExp(`(src=")${escapeRegExp(source)}(")`, 'g')
    result = result.replace(pattern, `$1${safeTarget}$2`)
  }
  return result
}

/** 清理 Wiki 链接：渲染层 wiki-link span 展开为纯文本（导出目标不认识 [[..]]） */
export const cleanWikiLinksInHtml = (html: string): string =>
  html.replace(/<span class="wiki-link"[^>]*>([\s\S]*?)<\/span>/g, '$1')

/** 模板样式：只调整版式与排版细节，正文结构保持编辑器渲染结果 */
export const getPublishTemplateCss = (template: PublishTemplate): string => {
  const base =
    "body{font-family:-apple-system,'Segoe UI','PingFang SC',sans-serif;max-width:760px;margin:40px auto;padding:0 24px;line-height:1.8;color:#1d1b18}" +
    'h1{font-size:1.9em}h2{font-size:1.4em;border-bottom:1px solid #eee;padding-bottom:.3em}h3{font-size:1.15em}' +
    'pre{background:#f5f2ee;padding:16px;border-radius:8px;overflow-x:auto}' +
    'code{font-family:Consolas,monospace;font-size:.9em}' +
    'blockquote{border-left:3px solid #7c6f5b;margin:1em 0;padding:.4em 1.2em;color:#5c5850;background:#faf8f5}' +
    'table{border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px 12px}th{background:#f5f2ee}' +
    'img{max-width:100%}'
  switch (template) {
    case 'technical':
      return `${base}body{max-width:860px}pre{border-left:3px solid #7c6f5b}h2{border-bottom-width:2px}`
    case 'paper':
      return `${base}body{font-family:'Source Han Serif SC','Noto Serif SC',Georgia,'PingFang SC',serif;line-height:2;max-width:720px}h1,h2,h3{text-align:left}blockquote{font-style:normal}`
    case 'wechat':
      return `${base}body{max-width:677px;margin:16px auto;padding:0 8px;line-height:2}section,pre{white-space:pre-wrap}img{display:block;margin:8px auto}`
    case 'blog':
    default:
      return base
  }
}

/** 标题页（仅 paper 模板）：标题 + 日期，正文从新页开始 */
export const getPublishTitlePage = (template: PublishTemplate, title: string, dateText: string): string => {
  if (template !== 'paper') return ''
  const safeTitle = title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return (
    `<div class="cover-page"><h1 class="cover-title">${safeTitle}</h1>` +
    `<p class="cover-date">${dateText}</p></div>`
  )
}

const escapeHtmlText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** 组装发布 HTML：模板 CSS + 可选标题页 + 可选目录容器（目录内容由 injectToc 注入） */
export const buildPublishHtml = (
  bodyHtml: string,
  title: string,
  options: PublishOptions,
  dateText = new Date().toLocaleDateString('zh-CN'),
): string => {
  const safeTitle = escapeHtmlText(title)
  const body = options.cleanWikiLinks ? cleanWikiLinksInHtml(bodyHtml) : bodyHtml
  const tocStyle = options.includeToc
    ? '.doc-toc{page-break-after:always}.doc-toc-title{font-size:1.3em;font-weight:700;margin-bottom:.6em}.doc-toc-list{list-style:none;padding-left:0;line-height:2}.toc-l2{padding-left:1.2em}.toc-l3{padding-left:2.4em;font-size:.94em}'
    : ''
  const cover = getPublishTitlePage(options.template, title, dateText)
  const coverStyle = cover
    ? '.cover-page{page-break-after:always;text-align:center;padding-top:18vh}.cover-title{font-size:2.2em;border:0}.cover-date{color:#5c5850}'
    : ''
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${safeTitle}</title>
<style>
${getPublishTemplateCss(options.template)}
</style>
<style>
${tocStyle}
${coverStyle}
</style>
</head>
<body>${cover}${body}</body>
</html>`
}

export interface CollectedBundle {
  /** mdimg:// 已改写为 assets/fileName 的 HTML */
  html: string
  assets: ExportAsset[]
  /** 读取失败的本地图片（缺失图片显式失败，不静默丢弃） */
  failedSources: string[]
  /** 危险/非本地协议来源：不写出，原样保留 */
  skippedSources: string[]
}

type BundleImageReader = (source: string) => Promise<string | null>

/**
 * 从导出 HTML 收集本地图片资源：
 * - 仅 mdimg:// 会写出；data:/file:/javascript: 等协议跳过并原样保留；
 * - 同一来源只读取与写出一次；
 * - 任一 mdimg 读取失败计入 failedSources，由调用方决定中止。
 */
export const collectExportBundle = async (
  html: string,
  readImage: BundleImageReader,
): Promise<CollectedBundle> => {
  const sources: string[] = []
  const skippedSources: string[] = []
  let m: RegExpExecArray | null
  MDIMG_SRC_RE.lastIndex = 0
  while ((m = MDIMG_SRC_RE.exec(html)) !== null) {
    const src = m[1]
    if (!sources.includes(src)) sources.push(src)
  }
  // 危险协议检查：带 src= 的其它协议显式记录（不收集、不改写）
  const otherSrcRe = /src="((?:data|file|javascript):[^"]+)"/g
  while ((m = otherSrcRe.exec(html)) !== null) {
    skippedSources.push(m[1])
  }

  const assets: ExportAsset[] = []
  const failedSources: string[] = []
  const mapping = new Map<string, string>()
  for (const source of sources) {
    let dataUrl: string | null = null
    try {
      dataUrl = await readImage(source)
    } catch {
      dataUrl = null
    }
    const asset = dataUrl ? dataUrlToExportAsset(source, dataUrl) : null
    if (!asset) {
      failedSources.push(source)
      continue
    }
    assets.push(asset)
    mapping.set(source, `assets/${asset.fileName}`)
  }
  return { html: rewriteBundleHtml(html, mapping), assets, failedSources, skippedSources }
}

export interface BundleWriteRequest {
  outputDir: string
  /** 资源包子目录名（来自 HTML <title>，主进程再做文件名净化） */
  folderName: string
  html: string
  assets: Array<{ fileName: string; data: Uint8Array }>
}

export interface BundleWriteResult {
  ok: boolean
  data?: { path: string; assetCount: number; bytes: number }
  error?: { code: string; message?: string }
}

export interface BuildBundleDeps {
  writeBundle: (request: BundleWriteRequest) => Promise<BundleWriteResult>
}

/** 从 HTML 提取 <title> 作为资源包目录名；缺失时回退"导出" */
const extractHtmlTitle = (html: string): string => {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(html)
  const title = match?.[1]?.trim()
  return title ? title : '导出'
}

/** 渲染层无 Node Buffer：用 TextEncoder 计算 UTF-8 字节长度 */
const utf8ByteLength = (text: string): number => new TextEncoder().encode(text).length

/**
 * 组装并写出资源包：校验体积与文件名安全后交由主进程原子写入。
 * 输出目录由调用方先行选择（取消发生在本函数之前），主进程负责最终写盘。
 */
export const buildExportBundle = async (
  html: string,
  assets: ExportAsset[],
  outputDir: string,
  deps?: Partial<BuildBundleDeps>,
): Promise<ExportBundleResult> => {
  const writeBundle = deps?.writeBundle
  if (!writeBundle) throw new ExportBundleError('INVALID_ARGUMENT')
  if (typeof outputDir !== 'string' || !outputDir.trim()) {
    throw new ExportBundleError('INVALID_ARGUMENT')
  }
  if (utf8ByteLength(html) > MAX_BUNDLE_HTML_BYTES) {
    throw new ExportBundleError('TOO_LARGE', 'HTML 超过 10MB，无法导出资源包')
  }
  let total = 0
  for (const asset of assets) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(asset.fileName)) {
      throw new ExportBundleError('INVALID_ARGUMENT', `资源文件名不安全：${asset.fileName}`)
    }
    if (!(asset.data instanceof Uint8Array) || asset.data.byteLength === 0) {
      throw new ExportBundleError('INVALID_ARGUMENT', `资源内容为空：${asset.fileName}`)
    }
    if (asset.data.byteLength > MAX_BUNDLE_ASSET_BYTES) {
      throw new ExportBundleError('TOO_LARGE', `单张图片超过 20MB：${asset.fileName}`)
    }
    total += asset.data.byteLength
  }
  if (total > MAX_BUNDLE_TOTAL_BYTES) {
    throw new ExportBundleError('TOO_LARGE', '资源总大小超过 100MB')
  }

  const result = await writeBundle({
    outputDir,
    folderName: extractHtmlTitle(html),
    html,
    assets: assets.map((asset) => ({ fileName: asset.fileName, data: asset.data })),
  })
  if (!result.ok || !result.data) {
    throw new ExportBundleError(result.error?.code ?? 'IO_ERROR', result.error?.message)
  }
  return result.data
}
