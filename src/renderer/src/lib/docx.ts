/* ==================== 零依赖 DOCX 导出：HTML → OOXML 部件构建 ====================
 *
 * 编辑器导出的 DOM 快照（含 KaTeX/Mermaid 渲染结果、内联 dataURL 图片），
 * 在渲染进程内遍历生成 word/document.xml 等文本部件；主进程只负责
 * 打包 ZIP 与写盘（见 main/ipc/export-docx.ts）。
 * 不引入任何第三方库：Word 兼容的最小 OOXML 子集 + PNG/JPEG 头解析。
 */

export interface DocxMediaItem {
  /** zip 内路径，如 word/media/image1.png */
  name: string
  data: Uint8Array
}

export interface DocxPackage {
  /** 文本部件（zip 路径 → XML 内容） */
  parts: Record<string, string>
  media: DocxMediaItem[]
}

export interface DocxBuildStats {
  paragraphs: number
  images: number
  skippedSvg: number
}

interface BuildOptions {
  /** Mermaid SVG 光栅化（渲染进程注入 canvas 实现；缺省时 SVG 回退为占位文本） */
  rasterizeSvg?: (svgOuterHtml: string) => Promise<string | null>
}
const EMU_PER_PX = 9525
const CONTENT_WIDTH_PX = 602 // A4 内容宽（6.27in @96dpi）
const IMAGE_MAX_EMU = CONTENT_WIDTH_PX * EMU_PER_PX
const MAX_MEDIA_ITEMS = 300

export const escapeXml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const escapeAttr = escapeXml

/** 从 PNG/JPEG 二进制头解析像素尺寸（保持导出图片宽高比用） */
export function parseImageSize(data: Uint8Array): { width: number; height: number } | null {
  if (data.length > 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    const width = (data[16]! << 24) | (data[17]! << 16) | (data[18]! << 8) | data[19]!
    const height = (data[20]! << 24) | (data[21]! << 16) | (data[22]! << 8) | data[23]!
    if (width > 0 && height > 0) return { width, height }
    return null
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) {
        i++
        continue
      }
      // 0xFF 填充字节：marker 前允许任意个填充，按带长度段处理会按垃圾值
      // 跳跃、错过真实 SOF 段
      if (data[i + 1] === 0xff) {
        i++
        continue
      }
      const marker = data[i + 1]!
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = (data[i + 5]! << 8) | data[i + 6]!
        const width = (data[i + 7]! << 8) | data[i + 8]!
        if (width > 0 && height > 0) return { width, height }
        return null
      }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2
        continue
      }
      const length = (data[i + 2]! << 8) | data[i + 3]!
      if (length < 2) return null
      i += 2 + length
    }
  }
  return null
}

const decodeDataUrl = (url: string): { ext: string; data: Uint8Array } | null => {
  const match = /^data:image\/(png|jpe?g|gif|bmp|webp);base64,(.+)$/i.exec(url.trim())
  if (!match) return null
  try {
    const binary = atob(match[2])
    const data = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i)
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpeg' : match[1].toLowerCase()
    return { ext, data }
  } catch {
    return null
  }
}

/* ---------- 行内（run）序列化 ---------- */

interface RunState {
  bold: boolean
  italic: boolean
  strike: boolean
  code: boolean
  /** 超链接内：run 追加 Hyperlink 字符样式 */
  link?: boolean
}

const runProps = (state: RunState): string => {
  let props = ''
  if (state.link) props += '<w:rStyle w:val="Hyperlink"/>'
  if (state.bold) props += '<w:b/>'
  if (state.italic) props += '<w:i/>'
  if (state.strike) props += '<w:strike/>'
  if (state.code) props += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/><w:shd w:val="clear" w:fill="F2F0EC"/>'
  return props ? `<w:rPr>${props}</w:rPr>` : ''
}

const textRun = (text: string, state: RunState): string =>
  `<w:r>${runProps(state)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`

const BREAK_RUN = '<w:r><w:br/></w:r>'

/* ---------- 构建器上下文 ---------- */

interface BuilderContext {
  bodyXml: string[]
  media: DocxMediaItem[]
  mediaRels: string[]
  hyperlinkRels: Map<string, string>
  images: number
  skippedSvg: number
  paragraphs: number
}

const ALIGN_MAP: Record<string, string> = {
  left: 'left',
  center: 'center',
  right: 'right',
  justify: 'both',
}

const styleTextAlign = (el: Element): string | null => {
  const style = el.getAttribute('style') ?? ''
  const match = /text-align:\s*(left|center|right|justify)/i.exec(style)
  return match ? (ALIGN_MAP[match[1]] ?? null) : null
}

/** 添加一张图片（dataURL）；返回内联 drawing XML；图片超限返回空串 */
function appendImage(ctx: BuilderContext, dataUrl: string): string {
  if (ctx.media.length >= MAX_MEDIA_ITEMS) return ''
  const decoded = decodeDataUrl(dataUrl)
  if (!decoded) return ''
  const index = ctx.media.length + 1
  const mediaName = `word/media/image${index}.${decoded.ext}`
  ctx.media.push({ name: mediaName, data: decoded.data })
  ctx.mediaRels.push(
    `<Relationship Id="rIdImg${index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${index}.${decoded.ext}"/>`,
  )
  ctx.images++
  const size = parseImageSize(decoded.data)
  // 无尺寸信息（webp/bmp 等）按 4x3 英寸兜底；有尺寸则按像素换算并限宽
  let widthEmu = 4 * 914400
  let heightEmu = 3 * 914400
  if (size) {
    const scale = Math.min(1, IMAGE_MAX_EMU / (size.width * EMU_PER_PX))
    widthEmu = Math.round(size.width * EMU_PER_PX * scale)
    heightEmu = Math.round(size.height * EMU_PER_PX * scale)
  }
  const relId = `rIdImg${index}`
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${widthEmu}" cy="${heightEmu}"/>` +
    `<wp:docPr id="${index}" name="Picture ${index}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${index}" name="image${index}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  )
}

function pushParagraph(ctx: BuilderContext, inner: string, pPr = '', countAsParagraph = true): void {
  if (inner === '' && pPr === '') return
  ctx.bodyXml.push(`<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`)
  if (countAsParagraph) ctx.paragraphs++
}

const HEADING_STYLE: Record<string, string> = {
  h1: 'Heading1',
  h2: 'Heading2',
  h3: 'Heading3',
  h4: 'Heading4',
  h5: 'Heading5',
  h6: 'Heading6',
}

/* ---------- 行内节点遍历 ---------- */

async function inlineContent(ctx: BuilderContext, node: Node, state: RunState): Promise<string> {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!text) return ''
    return textRun(text, state)
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as Element
  const tag = el.tagName.toLowerCase()

  // KaTeX：优先取 annotation 里的 TeX 源码（可编辑可移植），行内/块级由容器决定
  if (el.classList?.contains('katex')) {
    const annotation = el.querySelector('annotation[encoding="application/x-tex"]')
    const tex = (annotation?.textContent ?? el.textContent ?? '').trim()
    return tex ? textRun(tex, { ...state, code: true }) : ''
  }
  // 行内代码：递归全部子节点（可能含高亮 span / br，只取首子节点会丢内容）
  if (tag === 'code' && !el.closest('pre')) {
    return inlineChildren(ctx, el, { ...state, code: true })
  }
  if (tag === 'br') return BREAK_RUN
  if (tag === 'img') {
    const src = el.getAttribute('src') ?? ''
    if (src.startsWith('data:')) return appendImage(ctx, src)
    const alt = el.getAttribute('alt') ?? ''
    return alt ? textRun(`[${alt}]`, state) : ''
  }
  if (tag === 'svg') {
    // 行内 SVG（非 Mermaid 场景）无法嵌入，跳过并计数
    ctx.skippedSvg++
    return ''
  }
  if (tag === 'a') {
    const href = el.getAttribute('href') ?? ''
    const innerRuns = await inlineChildren(ctx, el, { ...state, link: true })
    if (/^https?:\/\//i.test(href)) {
      let relId = ctx.hyperlinkRels.get(href)
      if (!relId) {
        relId = `rIdLink${ctx.hyperlinkRels.size + 1}`
        ctx.hyperlinkRels.set(href, relId)
      }
      return `<w:hyperlink r:id="${relId}">${innerRuns}</w:hyperlink>`
    }
    return innerRuns
  }
  if (tag === 'input') {
    const checked = el.getAttribute('checked') !== null
    return textRun(checked ? '☑ ' : '☐ ', state)
  }
  if (tag === 'span' && el.classList?.contains('wiki-link')) {
    return inlineChildren(ctx, el, state)
  }

  const nextState: RunState = {
    bold: state.bold || tag === 'strong' || tag === 'b',
    italic: state.italic || tag === 'em' || tag === 'i',
    strike: state.strike || tag === 's' || tag === 'del' || tag === 'strike',
    code: state.code,
  }
  return inlineChildren(ctx, el, nextState)
}

async function inlineChildren(ctx: BuilderContext, el: Element, state: RunState): Promise<string> {
  let out = ''
  for (const child of Array.from(el.childNodes)) {
    out += await inlineContent(ctx, child, state)
  }
  return out
}

/* ---------- 块级节点遍历 ---------- */

async function blockNode(ctx: BuilderContext, el: Element, depth = 0): Promise<void> {
  const tag = el.tagName.toLowerCase()

  // Mermaid：SVG 光栅化为 PNG；失败回退占位文本
  const mermaidHost = el.classList?.contains('mermaid-block') ? el : el.querySelector?.('.mermaid-block')
  if (mermaidHost) {
    const svg = mermaidHost.querySelector('svg')
    if (svg && ctx.media.length < MAX_MEDIA_ITEMS) {
      let rasterized: string | null = null
      try {
        rasterized = await rasterizeSvgOuter(svg)
      } catch {
        rasterized = null
      }
      if (rasterized) {
        const run = appendImage(ctx, rasterized)
        pushParagraph(ctx, run, '<w:jc w:val="center"/>')
        return
      }
    }
    ctx.skippedSvg++
    pushParagraph(ctx, textRun('（Mermaid 图表：请参见原文）', { bold: false, italic: true, strike: false, code: false }), '<w:jc w:val="center"/>')
    return
  }

  if (HEADING_STYLE[tag]) {
    const inner = await inlineChildren(ctx, el, { bold: false, italic: false, strike: false, code: false })
    pushParagraph(ctx, inner, `<w:pStyle w:val="${HEADING_STYLE[tag]}"/>`)
    return
  }

  // 代码块（含 frontmatter 的代码展示）
  if (tag === 'pre') {
    const text = el.textContent ?? ''
    const lines = text.replace(/\n$/, '').split('\n')
    const shading = '<w:shd w:val="clear" w:fill="F5F2EE"/>'
    const fonts = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/>'
    lines.forEach((line) => {
      pushParagraph(
        ctx,
        line ? textRun(line, { bold: false, italic: false, strike: false, code: false }) : '',
        `${fonts}${shading}<w:spacing w:after="0"/>`,
      )
    })
    // 代码块后补一个空段落与后续内容分隔
    pushParagraph(ctx, '', '')
    return
  }

  if (tag === 'blockquote') {
    const border = '<w:pBdr><w:left w:val="single" w:sz="12" w:space="4" w:color="B8B2A8"/></w:pBdr>'
    const indent = '<w:ind w:left="360"/>'
    for (const child of Array.from(el.children)) {
      if (child.tagName.toLowerCase() === 'p') {
        const inner = await inlineChildren(ctx, child, { bold: false, italic: true, strike: false, code: false })
        pushParagraph(ctx, inner, `${border}${indent}`)
      } else {
        await blockNode(ctx, child, depth)
      }
    }
    return
  }

  // 列表：用缩进 + 项目符号文本模拟（避免 numbering.xml 复杂度，导出观感一致）
  if (tag === 'ul' || tag === 'ol') {
    await listBlock(ctx, el, tag === 'ol', 0)
    return
  }
  if (tag === 'li') {
    // 裸 li（不应出现）按段落兜底
    const inner = await inlineChildren(ctx, el, { bold: false, italic: false, strike: false, code: false })
    pushParagraph(ctx, inner, '<w:ind w:left="360"/>')
    return
  }

  if (tag === 'table') {
    tableBlock(ctx, el)
    return
  }

  if (tag === 'hr') {
    pushParagraph(
      ctx,
      '',
      '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="B8B2A8"/></w:pBdr>',
    )
    return
  }

  if (tag === 'p' || tag === 'div' || tag === 'section') {
    const align = styleTextAlign(el)
    // 块级公式容器（KaTeX display）居中
    const isDisplayMath = el.classList?.contains('math-block') || el.classList?.contains('math-block-inner')
    const inner = await inlineChildren(ctx, el, { bold: false, italic: false, strike: false, code: false })
    const pPr = align || isDisplayMath ? `<w:jc w:val="${align ?? 'center'}"/>` : ''
    pushParagraph(ctx, inner, pPr)
    return
  }

  // 未知块：递归子块（保底不丢内容）
  if (el.children.length > 0) {
    for (const child of Array.from(el.children)) {
      await blockNode(ctx, child, depth)
    }
    return
  }
  const text = el.textContent ?? ''
  if (text.trim()) {
    pushParagraph(ctx, await inlineContent(ctx, el, { bold: false, italic: false, strike: false, code: false }))
  }
}

async function listBlock(ctx: BuilderContext, listEl: Element, ordered: boolean, level: number): Promise<void> {
  const indent = 360 + level * 360
  let index = 1
  for (const item of Array.from(listEl.children)) {
    if (item.tagName.toLowerCase() !== 'li') continue
    const nested: Element[] = []
    const contentHosts: Element[] = []
    for (const child of Array.from(item.children)) {
      const childTag = child.tagName.toLowerCase()
      if (childTag === 'ul' || childTag === 'ol') nested.push(child)
      else contentHosts.push(child)
    }
    // 列表项可含多个段落：首段带项目符号，后续段落同缩进续排（不丢内容）
    if (contentHosts.length === 0) contentHosts.push(item)
    const marker = ordered ? `${index++}. ` : '· '
    const bullet = textRun(marker, { bold: false, italic: false, strike: false, code: false })
    for (let i = 0; i < contentHosts.length; i++) {
      const inner = await inlineChildren(ctx, contentHosts[i], {
        bold: false,
        italic: false,
        strike: false,
        code: false,
      })
      pushParagraph(
        ctx,
        i === 0 ? bullet + inner : inner,
        `<w:ind w:left="${indent}" w:hanging="${i === 0 ? 240 : 0}"/>`,
      )
    }
    for (const sub of nested) {
      await listBlock(ctx, sub, sub.tagName.toLowerCase() === 'ol', level + 1)
    }
  }
}

function tableBlock(ctx: BuilderContext, tableEl: Element): void {
  const rows = Array.from(tableEl.querySelectorAll('tr'))
  if (rows.length === 0) return
  const columnCount = Math.max(...rows.map((row) => row.children.length))
  const cellWidth = Math.max(500, Math.floor(9026 / Math.max(1, columnCount)))
  let tableXml =
    '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C8C3BA"/>`)
      .join('') +
    '</w:tblBorders></w:tblPr>' +
    `<w:tblGrid>${`<w:gridCol w:w="${cellWidth}"/>`.repeat(columnCount)}</w:tblGrid>`

  for (const row of rows) {
    tableXml += '<w:tr>'
    for (let c = 0; c < columnCount; c++) {
      const cell = row.children[c]
      const isHeader = cell?.tagName.toLowerCase() === 'th'
      const cellText = cell?.textContent ?? ''
      const align = cell ? styleTextAlign(cell) : null
      tableXml += '<w:tc><w:tcPr>'
      if (isHeader) tableXml += '<w:shd w:val="clear" w:fill="F0EDEA"/>'
      tableXml += '</w:tcPr>'
      const runState = { bold: isHeader, italic: false, strike: false, code: false }
      tableXml += `<w:p>${align ? `<w:pPr><w:jc w:val="${align}"/></w:pPr>` : ''}${textRun(cellText, runState)}</w:p>`
      tableXml += '</w:tc>'
    }
    tableXml += '</w:tr>'
  }
  tableXml += '</w:tbl>'
  ctx.bodyXml.push(tableXml)
  // 表格后必须跟一个段落（OOXML 要求 tbl 不能是 body 最后一个元素）
  pushParagraph(ctx, '', '', false)
}

/* ---------- SVG 光栅化（canvas，仅渲染进程可用） ---------- */

let canvasRasterizer: ((svgOuterHtml: string) => Promise<string | null>) | null = null

/** 由渲染进程注入 canvas 实现（node 测试环境保持 null，SVG 回退占位文本） */
export function setSvgRasterizer(fn: ((svgOuterHtml: string) => Promise<string | null>) | null): void {
  canvasRasterizer = fn
}

async function rasterizeSvgOuter(svg: Element): Promise<string | null> {
  if (!canvasRasterizer) return null
  return canvasRasterizer(svg.outerHTML)
}

/* ---------- 部件模板 ---------- */

const CONTENT_TYPES = (mediaExts: string[]): string => {
  const defaults = ['png', 'jpeg', 'gif', 'bmp', 'webp']
    .filter((ext) => mediaExts.includes(ext))
    .map((ext) => `<Default Extension="${ext}" ContentType="image/${ext === 'jpeg' ? 'jpeg' : ext}"/>`)
    .join('')
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    defaults +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>'
  )
}

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
  '</Relationships>'

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="等线"/>' +
  '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/>' +
  '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink">' +
  '<w:rPr><w:color w:val="0563C1" w:themeColor="hyperlink"/><w:u w:val="single"/></w:rPr></w:style>' +
  [1, 2, 3, 4, 5, 6]
    .map((level) => {
      const size = [32, 28, 24, 22, 22, 22][level - 1]!
      const outline = level <= 3 ? `<w:outlineLvl w:val="${level - 1}"/>` : ''
      return (
        `<w:style w:type="paragraph" w:styleId="Heading${level}">` +
        `<w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/>` +
        `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/>${outline}</w:pPr>` +
        `<w:rPr><w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`
      )
    })
    .join('') +
  '</w:styles>'

const coreXml = (title: string): string =>
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
  `<dc:title>${escapeXml(title)}</dc:title>` +
  '</cp:coreProperties>'

const APP_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
  '<Application>Paperin</Application></Properties>'

/**
 * 把导出 HTML 构建为 DOCX 包部件。
 * DOM 遍历为 async（Mermaid 光栅化需要 await canvas）。
 */
export async function buildDocxPackage(
  html: string,
  title: string,
  options: BuildOptions = {},
): Promise<{ pkg: DocxPackage; stats: DocxBuildStats }> {
  if (options.rasterizeSvg) setSvgRasterizer(options.rasterizeSvg)
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const ctx: BuilderContext = {
    bodyXml: [],
    media: [],
    mediaRels: [],
    hyperlinkRels: new Map(),
    images: 0,
    skippedSvg: 0,
    paragraphs: 0,
  }
  for (const child of Array.from(doc.body.children)) {
    await blockNode(ctx, child)
  }
  if (ctx.bodyXml.length === 0) {
    pushParagraph(ctx, textRun('', { bold: false, italic: false, strike: false, code: false }))
  }

  const hyperlinkEntries: string[] = []
  for (const entry of Array.from(ctx.hyperlinkRels.entries())) {
    const [href, relId] = entry
    hyperlinkEntries.push(
      `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeAttr(href)}" TargetMode="External"/>`,
    )
  }

  const documentRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    ctx.mediaRels.join('') +
    hyperlinkEntries.join('') +
    '</Relationships>'

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">' +
    '<w:body>' +
    ctx.bodyXml.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" ' +
    'w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>'

  const parts: Record<string, string> = {
    '[Content_Types].xml': CONTENT_TYPES(ctx.media.map((m) => m.name.split('.').pop() ?? '')),
    '_rels/.rels': ROOT_RELS,
    'word/document.xml': documentXml,
    'word/_rels/document.xml.rels': documentRels,
    'word/styles.xml': STYLES_XML,
    'docProps/core.xml': coreXml(title),
    'docProps/app.xml': APP_XML,
  }
  return {
    pkg: { parts, media: ctx.media },
    stats: {
      paragraphs: ctx.paragraphs,
      images: ctx.images,
      skippedSvg: ctx.skippedSvg,
    },
  }
}
