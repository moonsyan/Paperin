import { describe, expect, it, vi } from 'vitest'
import { createEmptyWorkspaceIndex } from '../../../shared/workspace-index'
import {
  MAX_BUNDLE_ASSET_BYTES,
  MAX_BUNDLE_HTML_BYTES,
  MAX_BUNDLE_TOTAL_BYTES,
  buildExportBundle,
  buildPublishHtml,
  cleanWikiLinksInHtml,
  collectExportBundle,
  dataUrlToExportAsset,
  getCollectionIndexBlockReason,
  rewriteBundleHtml,
} from './export-bundle'

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('collectExportBundle', () => {
  it('收集多个 mdimg 图片并改写为 assets/ 相对路径', async () => {
    const html = `<img src="mdimg:///D:/docs/a.png"><p>正文</p><img src="mdimg:///D:/docs/b.jpg">`
    const reader = vi.fn(async (source: string) => (source.endsWith('a.png') ? PNG_DATA_URL : 'data:image/jpeg;base64,AAIA'))
    const bundle = await collectExportBundle(html, reader)
    expect(bundle.failedSources).toEqual([])
    expect(bundle.assets).toHaveLength(2)
    expect(bundle.assets[0].fileName).toMatch(/^img-[0-9a-f]+\.png$/)
    expect(bundle.assets[1].fileName).toMatch(/^img-[0-9a-f]+\.jpg$/)
    expect(bundle.html).not.toContain('mdimg://')
    expect(bundle.html).toContain(`assets/${bundle.assets[0].fileName}`)
    expect(bundle.html).toContain(`assets/${bundle.assets[1].fileName}`)
  })

  it('重复图片来源去重，只读取与写出一次', async () => {
    const html = `<img src="mdimg:///D:/a.png"><img src="mdimg:///D:/a.png">`
    const reader = vi.fn(async () => PNG_DATA_URL)
    const bundle = await collectExportBundle(html, reader)
    expect(reader).toHaveBeenCalledTimes(1)
    expect(bundle.assets).toHaveLength(1)
    expect(bundle.html.match(/assets\//g)).toHaveLength(2)
  })

  it('读取失败的图片计入 failedSources，HTML 不改写该图（缺失图片显式失败）', async () => {
    const html = `<img src="mdimg:///D:/gone.png">`
    const bundle = await collectExportBundle(html, async () => null)
    expect(bundle.failedSources).toEqual(['mdimg:///D:/gone.png'])
    expect(bundle.assets).toHaveLength(0)
    expect(bundle.html).toContain('mdimg:///D:/gone.png')
  })

  it('危险协议不写出资源，原样保留', async () => {
    const html = `<img src="file:///C:/secret.png"><img src="data:image/png;base64,AAA"><img src="javascript:x">`
    const bundle = await collectExportBundle(html, async () => null)
    expect(bundle.assets).toHaveLength(0)
    expect(bundle.skippedSources).toHaveLength(3)
    expect(bundle.html).toContain('file:///C:/secret.png')
  })
})

describe('dataUrlToExportAsset', () => {
  it('解析 dataURL 为字节与扩展名', () => {
    const asset = dataUrlToExportAsset('mdimg:///D:/a.png', PNG_DATA_URL)
    expect(asset).not.toBeNull()
    expect(asset?.fileName.endsWith('.png')).toBe(true)
    expect(asset?.data.byteLength).toBeGreaterThan(0)
    expect(asset?.source).toBe('mdimg:///D:/a.png')
  })

  it('非法 dataURL 返回 null', () => {
    expect(dataUrlToExportAsset('mdimg:///D:/a.png', 'not-a-data-url')).toBeNull()
    expect(dataUrlToExportAsset('mdimg:///D:/a.svg', 'data:text/html;base64,PC9zY3JpcHQ+')).toBeNull()
  })
})

describe('rewriteBundleHtml / cleanWikiLinksInHtml', () => {
  it('按映射改写图片地址，未知来源保留', () => {
    const mapping = new Map([['mdimg:///D:/a.png', 'assets/img-1.png']])
    const html = '<img src="mdimg:///D:/a.png"><img src="mdimg:///D:/b.png">'
    expect(rewriteBundleHtml(html, mapping)).toBe('<img src="assets/img-1.png"><img src="mdimg:///D:/b.png">')
  })

  it('仅改写 src 属性：代码块等正文里的同串文本不被篡改', () => {
    const mapping = new Map([['mdimg:///D:/a.png', 'assets/img-1.png']])
    const html = '<p>示例</p><pre><code>mdimg:///D:/a.png</code></pre><img src="mdimg:///D:/a.png">'
    expect(rewriteBundleHtml(html, mapping)).toBe(
      '<p>示例</p><pre><code>mdimg:///D:/a.png</code></pre><img src="assets/img-1.png">',
    )
  })

  it('短来源是长来源前缀时不破坏长来源', () => {
    const mapping = new Map([
      ['mdimg:///D:/a.png', 'assets/img-1.png'],
      ['mdimg:///D:/a.png2.png', 'assets/img-2.png'],
    ])
    const html = '<img src="mdimg:///D:/a.png"><img src="mdimg:///D:/a.png2.png">'
    expect(rewriteBundleHtml(html, mapping)).toBe(
      '<img src="assets/img-1.png"><img src="assets/img-2.png">',
    )
  })

  it('清理 Wiki 链接为纯文本，其余内容不变', () => {
    const html = '<p>见 <span class="wiki-link" data-target="目标">目标笔记</span> 与正文</p>'
    expect(cleanWikiLinksInHtml(html)).toBe('<p>见 目标笔记 与正文</p>')
  })
})

describe('buildPublishHtml', () => {
  it('模板只影响样式与标题页，不改动正文 HTML', () => {
    const body = '<h1>标题</h1><p>内容</p>'
    const blog = buildPublishHtml(body, '文档', { template: 'blog', includeToc: false, inlineImages: true, cleanWikiLinks: false })
    const paper = buildPublishHtml(body, '文档', { template: 'paper', includeToc: false, inlineImages: true, cleanWikiLinks: false })
    expect(blog).toContain('<h1>标题</h1><p>内容</p>')
    expect(paper).toContain('<h1>标题</h1><p>内容</p>')
    expect(paper).toContain('文档') // 标题页
    expect(blog).not.toContain('cover-page')
    expect(paper).toContain('cover-page')
  })

  it('cleanWikiLinks 选项生效', () => {
    const body = '<p><span class="wiki-link" data-target="x">目标</span></p>'
    const html = buildPublishHtml(body, 't', { template: 'blog', includeToc: false, inlineImages: true, cleanWikiLinks: true })
    expect(html).not.toContain('wiki-link')
  })
})

describe('buildExportBundle', () => {
  const baseDeps = (result: { ok: boolean; data?: { path: string; assetCount: number; bytes: number }; error?: { code: string; message?: string } }) => ({
    writeBundle: vi.fn(async () => result),
  })

  it('写入成功返回资源包结果，请求包含标题与资源清单', async () => {
    const asset = dataUrlToExportAsset('mdimg:///D:/a.png', PNG_DATA_URL)!
    const deps = baseDeps({ ok: true, data: { path: 'D:/out/文档/index.html', assetCount: 1, bytes: 10 } })
    const result = await buildExportBundle('<title>文档</title><img src="assets/x.png">', [asset], 'D:/out', deps)
    expect(result).toEqual({ path: 'D:/out/文档/index.html', assetCount: 1, bytes: 10 })
    expect(deps.writeBundle).toHaveBeenCalledWith(expect.objectContaining({
      outputDir: 'D:/out',
      folderName: '文档',
      html: '<title>文档</title><img src="assets/x.png">',
      assets: [expect.objectContaining({ fileName: asset.fileName })],
    }))
  })

  it('HTML 超限、单资源超限、总量超限抛出 TOO_LARGE', async () => {
    const asset = dataUrlToExportAsset('mdimg:///D:/a.png', PNG_DATA_URL)!
    const bigHtml = `<title>t</title>${'x'.repeat(MAX_BUNDLE_HTML_BYTES + 1)}`
    await expect(buildExportBundle(bigHtml, [], 'D:/out', baseDeps({ ok: true, data: { path: '', assetCount: 0, bytes: 0 } }))).rejects.toMatchObject({ code: 'TOO_LARGE' })

    const hugeAsset: typeof asset = { ...asset, data: new Uint8Array(MAX_BUNDLE_ASSET_BYTES + 1) }
    await expect(buildExportBundle('<title>t</title>', [hugeAsset], 'D:/out', baseDeps({ ok: true, data: { path: '', assetCount: 0, bytes: 0 } }))).rejects.toMatchObject({ code: 'TOO_LARGE' })

    const many: typeof asset[] = []
    for (let i = 0; i < Math.ceil((MAX_BUNDLE_TOTAL_BYTES + 1) / MAX_BUNDLE_ASSET_BYTES); i++) {
      many.push({ ...asset, data: new Uint8Array(MAX_BUNDLE_ASSET_BYTES) })
    }
    await expect(buildExportBundle('<title>t</title>', many, 'D:/out', baseDeps({ ok: true, data: { path: '', assetCount: 0, bytes: 0 } }))).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('资源文件名含路径穿越时抛出 INVALID_ARGUMENT', async () => {
    const asset = dataUrlToExportAsset('mdimg:///D:/a.png', PNG_DATA_URL)!
    const evil = { ...asset, fileName: '../evil.png' }
    await expect(buildExportBundle('<title>t</title>', [evil], 'D:/out', baseDeps({ ok: true, data: { path: '', assetCount: 0, bytes: 0 } }))).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
  })

  it('目标目录为空时抛出 INVALID_ARGUMENT，不发出写入请求', async () => {
    const deps = baseDeps({ ok: true, data: { path: '', assetCount: 0, bytes: 0 } })
    await expect(buildExportBundle('<title>t</title>', [], '', deps)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' })
    expect(deps.writeBundle).not.toHaveBeenCalled()
  })

  it('写盘失败透传主进程错误码（临时目录原子写保证不残留半成品）', async () => {
    const deps = baseDeps({ ok: false, error: { code: 'IO_ERROR', message: '磁盘已满' } })
    await expect(buildExportBundle('<title>t</title>', [], 'D:/out', deps)).rejects.toMatchObject({ code: 'IO_ERROR' })
  })
})

describe('getCollectionIndexBlockReason', () => {
  it('空索引与 truncated 索引均阻断', () => {
    expect(getCollectionIndexBlockReason(null)).toMatch(/工作区/)
    const empty = createEmptyWorkspaceIndex('D:/v')
    expect(getCollectionIndexBlockReason(empty)).toMatch(/索引不完整/)
    const truncated = createEmptyWorkspaceIndex('D:/v')
    truncated.complete = true
    truncated.truncated = true
    expect(getCollectionIndexBlockReason(truncated)).toMatch(/索引不完整/)
  })

  it('complete 且未截断时允许集合导出', () => {
    const index = createEmptyWorkspaceIndex('D:/v')
    index.complete = true
    expect(getCollectionIndexBlockReason(index)).toBeNull()
  })
})
