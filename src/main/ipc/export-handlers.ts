import { execFile } from 'child_process'
import { promisify } from 'util'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdir, rename, rm, stat, unlink, writeFile } from 'fs/promises'
import { extname, join } from 'path'
import { CHANNELS } from '../../shared/ipc/channels'
import { MAX_DOCUMENT_FILE_SIZE } from './file-io'
import { createSaveAsWriteTargetAuthorizer, isPathTrusted, trustDirectory, writeIfDialogTargetStillAuthorized } from '../trusted-paths'

const execFileAsync = promisify(execFile)

const MAX_EXPORT_FILE_SIZE = 100 * 1024 * 1024

/** 资源包上限（与渲染层 lib/export-bundle 同口径） */
const MAX_BUNDLE_ASSET_BYTES = 20 * 1024 * 1024
const MAX_BUNDLE_TOTAL_BYTES = 100 * 1024 * 1024
const MAX_BUNDLE_HTML_BYTES = 10 * 1024 * 1024
const MAX_BUNDLE_ASSET_COUNT = 1000

/** 目录名净化：去除路径分隔符与 Windows 非法字符，限长 80 */
const sanitizeFolderName = (name: string): string => {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return cleaned || '导出'
}

const ASSET_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const registerExportHandlers = (): void => {
  // pandoc 可用性探测结果缓存（缓存 Promise 本身，避免首次探测期间的并发误报）。
  // 带 TTL：会话中途安装/修复 pandoc 后能再次探测，不必等重启
  let pandocCheck: Promise<boolean> | null = null
  let pandocCheckAt = 0
  const PANDOC_CHECK_TTL_MS = 60_000

  // 导出 PDF：隐藏窗口渲染 HTML 后 printToPDF（支持纸张/页边距/页眉页脚选项）
  ipcMain.handle(
    CHANNELS.FILE_EXPORT_PDF,
    async (
      event,
      args: {
        html: string
        defaultName: string
        options?: {
          pageSize?: 'A4' | 'Letter' | 'A5' | 'Legal'
          margins?: 'narrow' | 'standard' | 'wide'
          headerFooter?: boolean
        }
      },
    ) => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      if (!parent) return { ok: false, error: { code: 'WINDOW_NOT_FOUND' } }

      // 载荷与参数前置校验（args 为 null 时返回错误结构而非抛错）
      const html = args?.html
      const defaultName = args?.defaultName
      if (typeof html !== 'string' || typeof defaultName !== 'string' || !defaultName) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      if (Buffer.byteLength(html, 'utf-8') > MAX_EXPORT_FILE_SIZE) {
        return {
          ok: false,
          error: { code: 'TOO_LARGE', message: '导出内容过大，无法打印 PDF' },
        }
      }

      let save: Awaited<ReturnType<typeof dialog.showSaveDialog>>
      try {
        save = await dialog.showSaveDialog(parent, {
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
          defaultPath: defaultName,
        })
      } catch (error) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
      }
      if (save.canceled || !save.filePath) {
        return { ok: false, error: { code: 'CANCELLED' } }
      }
      const isPdfTargetAuthorized = await createSaveAsWriteTargetAuthorizer(save.filePath)
      if (!isPdfTargetAuthorized) {
        return { ok: false, error: { code: 'INVALID_PATH' } }
      }

      // 隐藏窗口加载文档 HTML，等待渲染完成后打印。
      // M2：data: URL 在 Chromium 中超过 ~2MB 会被截断/拒绝（内联图片后 HTML 很容易超限），
      // 改为写入临时文件后 loadFile，finally 中清理
      const tempHtml = join(
        app.getPath('temp'),
        `paperin-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.html`,
      )
      // F-L2：临时文件写入原在 try 外，磁盘满/权限不足时异常直接抛出 IPC，
      // 渲染层收不到错误结构。移入保护并返回结构化错误
      try {
        await writeFile(tempHtml, html, 'utf8')
      } catch {
        return { ok: false, error: { code: 'IO_ERROR', message: '无法写入临时文件' } }
      }
      // 窗口构造失败（资源耗尽等）也要清理临时文件并返回结构化错误，
      // 否则 tempHtml 残留且原始异常直达渲染端
      let printWindow: BrowserWindow
      try {
        printWindow = new BrowserWindow({
          show: false,
          // B-M4：与主窗口一致开启沙箱，打印窗口只渲染受信 HTML，无需完整 Node 能力
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        })
      } catch (error) {
        await unlink(tempHtml).catch(() => {})
        return { ok: false, error: { code: 'PDF_ERROR', message: String(error) } }
      }
      try {
        await printWindow.loadFile(tempHtml)
        // 等图片/字体等资源就绪；M4：加载挂起的资源会让 executeJavaScript
        // 永不 resolve（图片 onload/onerror 都不触发时），15s 超时兜底后继续打印
        const waitImages = printWindow.webContents.executeJavaScript(
          `new Promise(r => {
            const imgs = Array.from(document.images)
            if (imgs.length === 0) return r(true)
            Promise.all(imgs.map(i => i.complete ? 1 : new Promise(res => {
              i.onload = i.onerror = res
            }))).then(() => r(true))
          })`,
        )
        await Promise.race([
          waitImages,
          new Promise((resolve) => setTimeout(resolve, 15_000)),
        ])
        // 页边距档位 → 英寸（Chromium printToPDF 单位）
        const marginsByLevel = {
          narrow: { top: 0.3, bottom: 0.3, left: 0.35, right: 0.35 },
          standard: { top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 },
          wide: { top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 },
        } as const
        const margins = marginsByLevel[args.options?.margins ?? 'standard']
        const headerFooter = args.options?.headerFooter ?? false
        // 文件名可能含 HTML 特殊字符，页眉模板拼接前做最小转义
        const title = args.defaultName
          .replace(/\.pdf$/i, '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
        const headerFooterStyle = 'font-size:8px;color:#888;width:100%;padding:0 24px;'
        const pdf = await printWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: args.options?.pageSize ?? 'A4',
          margins,
          displayHeaderFooter: headerFooter,
          headerTemplate: headerFooter
            ? `<div style="${headerFooterStyle}text-align:center;">${title}</div>`
            : '',
          footerTemplate: headerFooter
            ? `<div style="${headerFooterStyle}text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`
            : '',
        })
        const pdfWritten = await writeIfDialogTargetStillAuthorized(
          save.filePath,
          async (target) => {
            await writeFile(target, pdf)
          },
          isPdfTargetAuthorized,
        )
        if (pdfWritten === 'invalid-path') {
          return { ok: false, error: { code: 'INVALID_PATH' } }
        }
        return { ok: true, data: { path: save.filePath } }
      } catch (error) {
        return { ok: false, error: { code: 'PDF_ERROR', message: String(error) } }
      } finally {
        // 已销毁窗口的 close() 会抛 "Object has been destroyed"，
        // 未捕获时会替换掉 try 块的正常返回值（成功导出变成 rejection）
        if (!printWindow.isDestroyed()) printWindow.close()
        unlink(tempHtml).catch(() => {})
      }
    },
  )

  // 通过 pandoc 导出 Word/LaTeX/纯文本/EPUB；未安装 pandoc 时返回 PANDOC_NOT_FOUND
  ipcMain.handle(
    CHANNELS.FILE_EXPORT_PANDOC,
    async (
      event,
      args: { markdown: string; defaultTitle: string },
    ) => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      if (!parent) return { ok: false, error: { code: 'WINDOW_NOT_FOUND' } }

      // 载荷与参数前置校验（args 为 null 时返回错误结构而非抛错）
      const markdown = args?.markdown
      const defaultTitle = args?.defaultTitle
      if (typeof markdown !== 'string' || typeof defaultTitle !== 'string' || !defaultTitle) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      if (Buffer.byteLength(markdown, 'utf-8') > MAX_DOCUMENT_FILE_SIZE) {
        return {
          ok: false,
          error: { code: 'TOO_LARGE', message: 'Markdown 超过 20MB，无法导出' },
        }
      }

      // 检测 pandoc 是否可用（首次调用时探测，结果缓存带 TTL；并发调用共享同一探测）。
      // L4：探测带 10s 超时——pandoc 挂起时不能阻塞导出入口
      const now = Date.now()
      if (!pandocCheck || now - pandocCheckAt > PANDOC_CHECK_TTL_MS) {
        pandocCheckAt = now
        pandocCheck = execFileAsync('pandoc', ['--version'], { timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
      }
      if (!(await pandocCheck)) {
        return { ok: false, error: { code: 'PANDOC_NOT_FOUND' } }
      }

      let save: Awaited<ReturnType<typeof dialog.showSaveDialog>>
      try {
        save = await dialog.showSaveDialog(parent, {
          filters: [
            { name: 'Word', extensions: ['docx'] },
            { name: 'EPUB', extensions: ['epub'] },
            { name: 'LaTeX', extensions: ['tex'] },
            { name: '纯文本', extensions: ['txt'] },
          ],
          defaultPath: `${defaultTitle}.docx`,
        })
      } catch (err) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
      }
      if (save.canceled || !save.filePath) {
        return { ok: false, error: { code: 'CANCELLED' } }
      }
      const isPandocTargetAuthorized = await createSaveAsWriteTargetAuthorizer(save.filePath)
      if (!isPandocTargetAuthorized) {
        return { ok: false, error: { code: 'INVALID_PATH' } }
      }

      // 扩展名 → pandoc 输出格式
      const fmtMap: Record<string, string> = {
        docx: 'docx',
        epub: 'epub',
        tex: 'latex',
        txt: 'plain',
      }
      const fmt = fmtMap[extname(save.filePath).slice(1).toLowerCase()]
      if (!fmt) return { ok: false, error: { code: 'UNSUPPORTED' } }

      // 写入临时 .md 后调用 pandoc（避免超长命令行参数）
      const tmpIn = join(
        app.getPath('temp'),
        `mdsoft-${process.pid}-${Date.now()}-${Math.random()}.md`,
      )
      try {
        await writeFile(tmpIn, markdown, 'utf-8')
        const pandocWritten = await writeIfDialogTargetStillAuthorized(
          save.filePath,
          async (target) => {
            await execFileAsync(
              'pandoc',
              ['-f', 'markdown', '-t', fmt, tmpIn, '-o', target],
              { timeout: 60_000 },
            )
          },
          isPandocTargetAuthorized,
        )
        if (pandocWritten === 'invalid-path') {
          return { ok: false, error: { code: 'INVALID_PATH' } }
        }
        return { ok: true, data: { path: save.filePath } }
      } catch (err) {
        return { ok: false, error: { code: 'PANDOC_ERROR', message: String(err) } }
      } finally {
        await unlink(tmpIn).catch(() => {})
      }
    },
  )

  // 选择资源包导出的目标目录（独立步骤：取消发生在任何写入之前）
  ipcMain.handle(
    CHANNELS.FILE_PICK_EXPORT_DIR,
    async (event, args: { title?: string }) => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      if (!parent) return { ok: false, error: { code: 'WINDOW_NOT_FOUND' } }
      if (args !== undefined && (typeof args !== 'object' || (args.title !== undefined && typeof args.title !== 'string'))) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      try {
        const result = await dialog.showOpenDialog(parent, {
          title: typeof args?.title === 'string' && args.title ? args.title : '选择导出位置',
          properties: ['openDirectory', 'createDirectory'],
        })
        if (result.canceled || result.filePaths.length === 0) {
          return { ok: false, error: { code: 'CANCELLED' } }
        }
        // 人工经原生对话框选择的目录授予导出信任：FILE_EXPORT_BUNDLE 写盘前
        // 校验该信任，防止被入侵的渲染进程绕过选择步骤向任意目录写文件
        trustDirectory(result.filePaths[0])
        return { ok: true, data: { path: result.filePaths[0] } }
      } catch (error) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
      }
    },
  )

  // 写出 HTML 资源包（index.html + assets/）：
  // 先写入输出目录下的临时子目录，全部成功后原子重命名——
  // 失败/中断只残留临时目录并立即清理，不会留下半成品
  ipcMain.handle(
    CHANNELS.FILE_EXPORT_BUNDLE,
    async (
      event,
      args: {
        outputDir: string
        folderName: string
        html: string
        assets: Array<{ fileName: string; data: Uint8Array }>
      },
    ) => {
      const parent = BrowserWindow.fromWebContents(event.sender)
      if (!parent) return { ok: false, error: { code: 'WINDOW_NOT_FOUND' } }

      // 载荷校验：路径、目录名、HTML 与资源清单的形状、协议无关（资源只认文件名字段）
      const outputDir = args?.outputDir
      const folderName = typeof args?.folderName === 'string' ? sanitizeFolderName(args.folderName) : ''
      const html = args?.html
      const assets = args?.assets
      if (
        typeof outputDir !== 'string' ||
        !outputDir.trim() ||
        !folderName ||
        typeof html !== 'string' ||
        !Array.isArray(assets)
      ) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      if (Buffer.byteLength(html, 'utf-8') > MAX_BUNDLE_HTML_BYTES) {
        return { ok: false, error: { code: 'TOO_LARGE', message: 'HTML 超过 10MB，无法导出资源包' } }
      }
      if (assets.length > MAX_BUNDLE_ASSET_COUNT) {
        return { ok: false, error: { code: 'TOO_LARGE', message: '资源数量超过上限' } }
      }
      let totalBytes = Buffer.byteLength(html, 'utf-8')
      for (const asset of assets) {
        if (!asset || typeof asset.fileName !== 'string' || !ASSET_NAME_RE.test(asset.fileName)) {
          return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '资源文件名不安全' } }
        }
        const data = asset.data
        if (!(data instanceof Uint8Array) || data.byteLength === 0) {
          return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '资源内容为空' } }
        }
        if (data.byteLength > MAX_BUNDLE_ASSET_BYTES) {
          return { ok: false, error: { code: 'TOO_LARGE', message: `单张图片超过 20MB：${asset.fileName}` } }
        }
        totalBytes += data.byteLength
      }
      if (totalBytes > MAX_BUNDLE_TOTAL_BYTES) {
        return { ok: false, error: { code: 'TOO_LARGE', message: '资源总大小超过 100MB' } }
      }

      // 目标目录必须已存在（由目录选择步骤保证；此处防御性校验），
      // 且必须属于已授权的导出信任根——这是资源包写盘通道的授权边界
      if (!isPathTrusted(outputDir)) {
        return { ok: false, error: { code: 'INVALID_PATH', message: '目标目录未经过导出授权，请重新选择导出位置' } }
      }
      try {
        const targetStat = await stat(outputDir)
        if (!targetStat.isDirectory()) {
          return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '目标不是文件夹' } }
        }
      } catch {
        return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '目标文件夹不存在' } }
      }

      // 同名资源包已存在时追加序号，不覆盖历史导出
      let finalDir = join(outputDir, folderName)
      try {
        for (let n = 2; (await stat(finalDir)).isDirectory(); n++) {
          finalDir = join(outputDir, `${folderName} (${n})`)
        }
      } catch {
        // stat 失败 = 不存在 = 直接使用
      }

      // 临时目录建在输出目录内（保证同一卷，rename 原子生效）
      const tempDir = join(outputDir, `.mk-bundle-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      try {
        await mkdir(join(tempDir, 'assets'), { recursive: true })
        await writeFile(join(tempDir, 'index.html'), html, 'utf8')
        for (const asset of assets) {
          await writeFile(join(tempDir, 'assets', asset.fileName), asset.data)
        }
        await rename(tempDir, finalDir)
        return {
          ok: true,
          data: { path: join(finalDir, 'index.html'), assetCount: assets.length, bytes: totalBytes },
        }
      } catch (error) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {})
        return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
      }
    },
  )
}
