import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import iconv from 'iconv-lite'
import { CHANNELS } from '../../shared/ipc/channels'
import {
  allowImageDirectory,
  isImageDirAllowed,
  readImageAsDataUrl,
} from '../image-protocol'
import { schedulePersistTrust } from '../session-trust'
import { isFileTrustedForSave, trustDirectory, trustFileForSave } from '../trusted-paths'
import type {
  DocumentSaveArgs,
  DocumentSaveEncoding,
  DocumentSaveResult,
} from './document-save-types'
import {
  getKnownFileState,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_EXPORT_FILE_SIZE,
  FileWriteRecoveryPendingError,
  readTextAutoEncoding,
  recoverInterruptedFileWrite,
  rememberFileState,
  UnsupportedEncodingError,
  writeFileAtomically,
} from './file-io'
import { isValidBase64Payload, MAX_IMAGE_BASE64_LENGTH, MAX_IMAGE_SIZE } from './image-payload'
import { acquireCrossProcessSaveLock, SaveLockIoError } from './save-lock'
import { normalizeAttachmentDirectory, resolveAttachmentDirectory } from './attachment-path'

const MAX_CSS_FILE_SIZE = 1024 * 1024
/** 图片管理最多扫描的目录数，避免异常 IPC 参数导致大量目录遍历 */
const MAX_IMAGE_LIST_DIRS = 20
/** 图片管理最多返回的图片数，避免大量缩略图阻塞渲染进程 */
const MAX_IMAGE_LIST_COUNT = 1000
/** FILE_SAVE 允许的写回编码；与 file-io.ts 检测侧、DocumentSaveEncoding 保持一致 */
const SAVE_ENCODINGS: ReadonlySet<DocumentSaveEncoding> = new Set([
  'UTF-8',
  'UTF-8-BOM',
  'UTF-16LE',
  'UTF-16BE',
  'GBK',
] as const)

/** 同路径并发保存互斥（T-OCTOU）：按 path 串行化 FILE_SAVE 的完整写盘流程 */
const saveLocks = new Map<string, Promise<unknown>>()

export interface FileHandlerDependencies {
  isTrustedPath(candidate: unknown): boolean
}

export const registerFileHandlers = ({ isTrustedPath }: FileHandlerDependencies): void => {
  /** 读取并返回一个 Markdown 文档（stat/体积/编码校验 + 文件状态登记）。
   *  授权判定由各通道自行完成：FILE_READ 要求路径已授信，
   *  FILE_READ_DROPPED 的路径必须来自预加载层 webUtils 解析的真实系统拖拽。 */
  const readDocumentAtPath = async (
    filePath: string,
  ): Promise<
    | { ok: true; data: { path: string; name: string; content: string; modifiedTime: number; encoding: string } }
    | { ok: false; error: { code: string; message?: string } }
  > => {
    try {
      // Recovery must run before stat: copyFile may remove its destination
      // after an interrupted overwrite, leaving only the verified backup.
      await recoverInterruptedFileWrite(filePath)
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) {
        return { ok: false, error: { code: 'NOT_FILE' } }
      }
      if (fileStat.size > MAX_DOCUMENT_FILE_SIZE) {
        return {
          ok: false,
          error: { code: 'TOO_LARGE', message: 'Markdown 文件超过 20MB，无法打开' },
        }
      }
      const { content, encoding } = await readTextAutoEncoding(filePath)
      rememberFileState(filePath, { mtimeMs: fileStat.mtimeMs, size: fileStat.size })
      return {
        ok: true,
        data: {
          path: filePath,
          name: filePath.split(/[/\\]/).pop() || 'untitled.md',
          content,
          modifiedTime: fileStat.mtimeMs,
          encoding,
        },
      }
    } catch (error) {
      if (error instanceof FileWriteRecoveryPendingError) {
        return { ok: false, error: { code: 'FILE_BUSY', message: error.message } }
      }
      if (error instanceof UnsupportedEncodingError) {
        return { ok: false, error: { code: 'UNSUPPORTED_ENCODING', message: error.message } }
      }
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  }

  ipcMain.handle(CHANNELS.FILE_OPEN, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, error: { code: 'WINDOW_NOT_FOUND' } }

    const result = await dialog.showOpenDialog(window, {
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: { code: 'CANCELLED' } }
    }

    const filePath = result.filePaths[0]
    // H1 修复：对话框选择 = 用户明确授权，授完整信任根；
    // 该文件本身另加入文件级保存白名单
    trustDirectory(dirname(filePath))
    // Y-L4：目录信任根非保底（64 上限，最早淘汰）——打开第 65 个目录后
    // 最早的根被淘汰，已打开文件的 mdimg 图片读取随之失效（图片破图）。
    // 图片读取白名单独立于 trustedRoots 再登记一份（只读权限，不扩大攻击面），
    // 即使目录信任被淘汰，文档里的图片仍可显示
    allowImageDirectory(dirname(filePath))
    trustFileForSave(filePath)
    schedulePersistTrust()
    return readDocumentAtPath(filePath)
  })

  // 按路径读取文件（会话恢复/重新打开已授权文档用，不弹对话框）。
  // 安全边界（H1 收紧）：不再以 .md/.markdown 扩展名作为授权条件——
  // 那等于允许渲染层脚本读取并随后写回用户磁盘上任意 Markdown。
  // 只有已属信任根（对话框/工作区/会话预授权）或文件级保存白名单
  // （主进程私有 trusted-roots.json 恢复）的路径才可读取。
  ipcMain.handle(CHANNELS.FILE_READ, async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    if (!isTrustedPath(filePath) && !isFileTrustedForSave(filePath)) {
      return {
        ok: false,
        error: {
          code: 'NOT_AUTHORIZED',
          message: '该文件未在本应用中授权，请通过打开对话框、拖拽或工作区重新打开',
        },
      }
    }
    return readDocumentAtPath(filePath)
  })

  // 读取拖入的文件。路径解析在预加载层完成（webUtils.getPathForFile）：
  // 只有真实 OS 拖拽产生的 File 才携带路径，渲染层伪造的 File 对象解析
  // 结果为空被拒绝——渲染层脚本无法借此读取未授权路径。
  ipcMain.handle(CHANNELS.FILE_READ_DROPPED, async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    const result = await readDocumentAtPath(filePath)
    if (result.ok) {
      // H1 修复：拖入的 .md 只授其目录"图片读取"权限（allowImageDirectory），
      // 该文件本身加入文件级保存白名单——不因读取而获得目录写/删/搜权限
      allowImageDirectory(dirname(filePath))
      trustFileForSave(filePath)
      schedulePersistTrust()
    }
    return result
  })

  // 导出 HTML/PDF 内联图片：把受信任 mdimg:// URL 读为 base64（只读）。
  // 渲染层 fetch() 自定义 scheme 被 Blink 拒绝（TypeError），必须走主进程；
  // 信任校验与 mdimg 协议完全一致（readImageAsDataUrl 内部 realpath 双重校验）
  ipcMain.handle(CHANNELS.FILE_READ_IMAGE_INLINE, async (_event, src: string) => {
    if (typeof src !== 'string' || !src.startsWith('mdimg://')) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    try {
      const dataUrl = await readImageAsDataUrl(src)
      if (!dataUrl) return { ok: false, error: { code: 'INVALID_PATH' } }
      return { ok: true, data: { dataUrl } }
    } catch {
      return { ok: false, error: { code: 'IO_ERROR' } }
    }
  })

  // 选择本地 CSS 文件并读取内容（自定义主题导入）
  ipcMain.handle(CHANNELS.FILE_PICK_CSS, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return { ok: false, error: { code: 'WINDOW_NOT_FOUND' } }
    const result = await dialog.showOpenDialog(window, {
      filters: [{ name: 'CSS', extensions: ['css'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false, error: { code: 'CANCELLED' } }
    }
    try {
      const filePath = result.filePaths[0]
      // L8：用户经原生对话框选择即授权（文件在对话框之外不可读）
      trustDirectory(dirname(filePath))
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) {
        return { ok: false, error: { code: 'IO_ERROR', message: '选择的不是普通文件' } }
      }
      // 必须在 readFile 前检查，避免误选超大文件造成内存峰值。
      if (fileStat.size > MAX_CSS_FILE_SIZE) {
        return { ok: false, error: { code: 'TOO_LARGE', message: 'CSS 文件过大（>1MB）' } }
      }
      const content = await readFile(filePath, 'utf-8')
      // 读取期间文件可能被替换，再次校验避免超限内容进入渲染进程。
      if (Buffer.byteLength(content, 'utf-8') > MAX_CSS_FILE_SIZE) {
        return { ok: false, error: { code: 'TOO_LARGE', message: 'CSS 文件过大（>1MB）' } }
      }
      return {
        ok: true,
        data: { name: basename(filePath), content },
      }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  /** FILE_SAVE 的完整写盘流程（stat 校验 → 编码写回 → 更新基线）。
   *  经 saveLocks 按 path 串行执行，防止同路径双窗口并发保存互相覆盖（T-OCTOU）；
   *  外层再加跨进程文件锁，覆盖多窗口模式（多个主进程并存）下的并发保存。 */
  const performFileSave = async (args: DocumentSaveArgs): Promise<DocumentSaveResult> => {
    let releaseLock: (() => Promise<void>) | null = null
    try {
      releaseLock = await acquireCrossProcessSaveLock(args.path)
    } catch (err) {
      // SaveLockIoError = 锁文件目录不可写（真 IO 错误），不能伪装成并发冲突；
      // SAVE_LOCK_TIMEOUT 与其余情况 = 30s 内未能拿到跨进程锁
      if (err instanceof SaveLockIoError) {
        return {
          ok: false,
          error: { code: 'SAVE_ERROR', message: '无法写入文件：目录不可写或磁盘只读' },
        }
      }
      return {
        ok: false,
        error: { code: 'SAVE_LOCKED', message: '另一个窗口正在保存该文件，请稍后重试' },
      }
    }
    try {
      const pre = await stat(args.path).catch(() => null)
      if (!pre) {
        return { ok: false, error: { code: 'NOT_FOUND' } }
      }
      // 冲突检测（H6）：磁盘 mtime 明显比预期新、或文件尺寸与最近一次读/写不一致，
      // 均视为被外部修改，拒绝写入避免静默覆盖。
      // - mtime 容差 500ms 仅吸收本应用连续保存的时间戳抖动（NTFS 纳秒精度无需大容差）；
      // - 尺寸维度可捕获 FAT32 同时间片内被编辑、以及 git checkout / cp -p 等
      //   旧 mtime 的外部修改（此前 3 秒无条件容差会让这些修改被静默覆盖）。
      const known = getKnownFileState(args.path)
      // expectedMtime 必须是有限数字（NaN 能通过 typeof 检查但比较恒 false，
      // 会让 mtime 维度静默失效）；主进程自记的 known.mtimeMs 作为第二道
      // 依据，渲染层传入坏值时仍能拦下外部修改
      const expectedMtime =
        typeof args.expectedMtime === 'number' && Number.isFinite(args.expectedMtime)
          ? args.expectedMtime
          : null
      const conflict =
        (expectedMtime !== null && pre.mtimeMs > expectedMtime + 500) ||
        (known !== undefined &&
          (pre.size !== known.size || pre.mtimeMs > known.mtimeMs + 500))
      if (conflict) {
        return {
          ok: false,
          error: { code: 'CONFLICT', message: '文件已被外部修改' },
        }
      }
      // 编码写回：UTF-16 保持原编码（BOM 保留）；GBK 写回原编码并做往返校验，
      // 无法映射的字符拒绝写入；带 BOM 的 UTF-8 写回 BOM（Y-L1，读取时记
      // 'UTF-8-BOM' 保存时不丢失）；其余统一 UTF-8
      if (args.encoding === 'UTF-8-BOM') {
        await writeFileAtomically(args.path, `\uFEFF${args.content}`, pre.mode)
      } else if (args.encoding === 'UTF-16LE' || args.encoding === 'UTF-16BE') {
        const bom =
          args.encoding === 'UTF-16LE'
            ? Buffer.from([0xff, 0xfe])
            : Buffer.from([0xfe, 0xff])
        const body =
          args.encoding === 'UTF-16LE'
            ? Buffer.from(args.content, 'utf16le')
            : iconv.encode(args.content, 'utf-16be')
        await writeFileAtomically(args.path, Buffer.concat([bom, body]), pre.mode)
      } else if (args.encoding === 'GBK') {
        const encoded = iconv.encode(args.content, 'gbk')
        // 往返校验：GBK 无法映射的字符（emoji 等）会被 iconv 替换为 '?'，
        // 静默写入即不可逆数据丢失，拒绝并由渲染端决定降级方案
        if (iconv.decode(encoded, 'gbk') !== args.content) {
          return {
            ok: false,
            error: {
              code: 'ENCODING_LOSS',
              message: '内容包含 GBK 无法表示的字符',
            },
          }
        }
        await writeFileAtomically(args.path, encoded, pre.mode)
      } else {
        await writeFileAtomically(args.path, args.content, pre.mode)
      }
      const fileStat = await stat(args.path)
      rememberFileState(args.path, { mtimeMs: fileStat.mtimeMs, size: fileStat.size })
      return { ok: true, data: { modifiedTime: fileStat.mtimeMs } }
    } catch (err) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
    } finally {
      await releaseLock?.()
    }
  }

  // 保存文件（带外部冲突检测：磁盘 mtime 比预期新则拒绝，避免静默覆盖）
  ipcMain.handle(
    CHANNELS.FILE_SAVE,
    async (_event, args: DocumentSaveArgs): Promise<DocumentSaveResult> => {
      // L8：入参校验——args 缺失或形状非法时返回结构化错误，避免后续
      // args.path / args.content 解引用抛未分类异常（此前 FILE_SAVE 无此守卫）
      if (
        !args ||
        typeof args !== 'object' ||
        typeof args.path !== 'string' ||
        typeof args.content !== 'string'
      ) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      // 编码白名单：未知 encoding 一律拒绝而非静默按无 BOM UTF-8 写出，
      // 否则原 GBK / UTF-8-BOM 文件会在保存时被悄悄改编码
      if (
        args.encoding !== undefined &&
        !SAVE_ENCODINGS.has(args.encoding as DocumentSaveEncoding)
      ) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      try {
        // L8：保存目标必须属于已授权根（打开的文档/对话框另存的位置），
        // 或为本应用读取过的 .md 精确文件（拖入/会话恢复，见 trusted-paths.ts）
        if (!isTrustedPath(args.path) && !isFileTrustedForSave(args.path)) {
          return { ok: false, error: { code: 'INVALID_PATH' } }
        }
        // L6：写入前校验体积，与打开上限保持一致——
        // 渲染端异常（内存溢出回写、循环拼接）不能写出超限文件
        if (Buffer.byteLength(args.content ?? '', 'utf-8') > MAX_DOCUMENT_FILE_SIZE) {
          return {
            ok: false,
            error: { code: 'TOO_LARGE', message: 'Markdown 文件超过 20MB，无法保存' },
          }
        }
        // 同路径并发保存互斥：双窗口（同进程）保存同一文件时，双方的冲突检测
        // stat 都落在对方写入之前，最后写入者会静默覆盖对方内容（T-OCTOU）。
        // 按 path 串行化完整写盘流程；互斥条目随任务结束清理，不累积。
        const previous = saveLocks.get(args.path) ?? Promise.resolve()
        const task = previous.then(() => performFileSave(args))
        const tracked = task.catch(() => undefined)
        saveLocks.set(args.path, tracked)
        try {
          return await task
        } finally {
          if (saveLocks.get(args.path) === tracked) saveLocks.delete(args.path)
        }
      } catch (err) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
      }
    },
  )

  // 另存为（支持自定义过滤器，用于导出 HTML 等）
  ipcMain.handle(
    CHANNELS.FILE_SAVE_AS,
    async (
      event,
      args: {
        content: string
        filters?: { name: string; extensions: string[] }[]
        defaultPath?: string
      },
    ) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) return { ok: false, error: { code: 'WINDOW_NOT_FOUND' } }

      // 载荷与参数前置校验（args 为 null 时返回错误结构而非抛错，与全项目约定一致）
      const content = args?.content
      if (typeof content !== 'string') {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      // filters/defaultPath 直接透传给原生对话框，形状非法时必须拒绝，
      // 否则 dialog 抛出的未分类异常会绕过 {ok:false,error} 结构直达渲染端
      if (
        args?.filters !== undefined &&
        (!Array.isArray(args.filters) ||
          args.filters.some(
            (f) =>
              !f ||
              typeof f !== 'object' ||
              typeof f.name !== 'string' ||
              !Array.isArray(f.extensions) ||
              f.extensions.some((e) => typeof e !== 'string'),
          ))
      ) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      if (args?.defaultPath !== undefined && typeof args.defaultPath !== 'string') {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      const filters = args?.filters ?? [{ name: 'Markdown', extensions: ['md'] }]
      const defaultPath = args?.defaultPath ?? 'untitled.md'
      // 另存上限：.md 类与文档打开上限一致；导出（HTML 等，内联图片可远超原文）
      // 放宽到导出上限，仅阻止失控写出
      const cap = /\.(md|markdown)$/i.test(defaultPath)
        ? MAX_DOCUMENT_FILE_SIZE
        : MAX_EXPORT_FILE_SIZE
      if (Buffer.byteLength(content, 'utf-8') > cap) {
        return {
          ok: false,
          error: { code: 'TOO_LARGE', message: '导出内容过大，无法保存' },
        }
      }

      let dialogResult: Awaited<ReturnType<typeof dialog.showSaveDialog>>
      try {
        dialogResult = await dialog.showSaveDialog(window, {
          filters,
          defaultPath,
        })
      } catch (err) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
      }

      if (dialogResult.canceled || !dialogResult.filePath) {
        return { ok: false, error: { code: 'CANCELLED' } }
      }
      const result = dialogResult

      try {
        // L8：用户经原生对话框选择的位置即授权（写穿与后续保存均可用）
        trustDirectory(dirname(result.filePath))
        await writeFileAtomically(result.filePath, content)
        // 返回真实落盘 mtime（渲染端用于下次保存的冲突检测，比 Date.now() 更准）
        let modifiedTime = 0
        try {
          const fileStat = await stat(result.filePath)
          modifiedTime = fileStat.mtimeMs
          rememberFileState(result.filePath, {
            mtimeMs: fileStat.mtimeMs,
            size: fileStat.size,
          })
        } catch {
          /* stat 失败不阻断，渲染端会降级用当前时间 */
        }
        return {
          ok: true,
          data: {
            path: result.filePath,
            name: result.filePath.split(/[/\\]/).pop() || 'untitled.md',
            modifiedTime,
          },
        }
      } catch (err) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
      }
    },
  )

  // 保存剪贴板/拖入的图片，返回磁盘路径
  ipcMain.handle(
    CHANNELS.FILE_SAVE_IMAGE,
    async (
      _event,
      args: {
        dataUrl: string
        docPath?: string
        workspacePath?: string
        workspaceAttachmentDirectory?: string | null
        globalAttachmentDirectory?: string | null
      },
    ) => {
      // L8：入参形状守卫——dataUrl 必须是字符串，docPath/workspacePath 提供时也须是；
      // 否则下方解引用会以未分类 TypeError 直接 reject，绕过稳定错误码约定
      if (
        !args ||
        typeof args !== 'object' ||
        typeof args.dataUrl !== 'string' ||
        (args.docPath !== undefined && typeof args.docPath !== 'string') ||
        (args.workspacePath !== undefined && typeof args.workspacePath !== 'string') ||
        (args.workspaceAttachmentDirectory !== undefined &&
          args.workspaceAttachmentDirectory !== null &&
          typeof args.workspaceAttachmentDirectory !== 'string') ||
        (args.globalAttachmentDirectory !== undefined &&
          args.globalAttachmentDirectory !== null &&
          typeof args.globalAttachmentDirectory !== 'string')
      ) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      try {
        // L8：文档/工作区路径必须已授信；未提供（未保存文档）时回退用户数据目录
        // F-M：FILE_READ 为分散文件（拖入/会话恢复的 .md）授予 trustFileForSave，
        // 这里只认完整信任根会让分散文件粘贴图片被 INVALID_PATH 拒绝——与 FILE_SAVE 一致
        if (args.docPath && !isTrustedPath(args.docPath) && !isFileTrustedForSave(args.docPath)) {
          return { ok: false, error: { code: 'INVALID_PATH' } }
        }
        if (args.workspacePath && !isTrustedPath(args.workspacePath)) {
          return { ok: false, error: { code: 'INVALID_PATH' } }
        }
        if (
          (args.workspaceAttachmentDirectory !== undefined &&
            args.workspaceAttachmentDirectory !== null &&
            !normalizeAttachmentDirectory(args.workspaceAttachmentDirectory)) ||
          (args.globalAttachmentDirectory !== undefined &&
            args.globalAttachmentDirectory !== null &&
            !normalizeAttachmentDirectory(args.globalAttachmentDirectory))
        ) {
          return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
        }
        const match = args.dataUrl.match(
          /^data:(image\/(png|jpe?g|gif|webp|bmp));base64,(.+)$/i,
        )
        if (!match) {
          return { ok: false, error: { code: 'UNSUPPORTED' } }
        }
        if (match[3].length > MAX_IMAGE_BASE64_LENGTH) {
          return {
            ok: false,
            error: { code: 'TOO_LARGE', message: '图片超过 20MB，无法保存' },
          }
        }
        // L6：解码前校验，损坏的 base64 不再静默写出截断图片
        if (!isValidBase64Payload(match[3])) {
          return { ok: false, error: { code: 'INVALID_DATA', message: '图片数据损坏，无法保存' } }
        }
        const ext = match[2].toLowerCase().replace('jpeg', 'jpg')
        const buffer = Buffer.from(match[3], 'base64')
        if (buffer.length > MAX_IMAGE_SIZE) {
          return {
            ok: false,
            error: { code: 'TOO_LARGE', message: '图片超过 20MB，无法保存' },
          }
        }

        const resolution = resolveAttachmentDirectory({
          docPath: args.docPath,
          workspacePath: args.workspacePath,
          workspaceDirectory: args.workspaceAttachmentDirectory,
          globalDirectory: args.globalAttachmentDirectory,
        })
        const dir = args.docPath || args.workspacePath
          ? resolution.directory
          : join(app.getPath('userData'), 'images')
        await mkdir(dir, { recursive: true })
        let name = ''
        let filePath = ''
        let created = false
        for (let attempt = 0; attempt < 100; attempt++) {
          name = `image-${Date.now()}-${Math.floor(Math.random() * 1e4)}.${ext}`
          filePath = join(dir, name)
          try {
            await writeFile(filePath, buffer, { flag: 'wx' })
            created = true
            break
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
          }
        }
        if (!created) {
          return { ok: false, error: { code: 'NAME_EXHAUSTED' } }
        }
        allowImageDirectory(dir)
        schedulePersistTrust()
        const relativePath = args.docPath
          ? `${resolution.relativeToDocument}/${name}`.replace(/^\.\//, '')
          : undefined
        return {
          ok: true,
          data: relativePath ? { path: filePath, name, relativePath } : { path: filePath, name },
        }
      } catch (err) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
      }
    },
  )

  // 列出指定目录下的图片文件（图片管理面板）
  ipcMain.handle(CHANNELS.FILE_LIST_IMAGES, async (_event, dirs: string[]) => {
    if (
      !Array.isArray(dirs) ||
      dirs.length > MAX_IMAGE_LIST_DIRS ||
      dirs.some(
        (dir) =>
          typeof dir !== 'string' ||
          !dir ||
          dir.length > 4096 ||
          (!isTrustedPath(dir) && !isImageDirAllowed(dir)),
      )
    ) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
    }
    const images: { path: string; name: string; size: number }[] = []
    // 未保存文档的粘贴图片会保存到用户数据目录，图片管理也应当可见。
    const imageDirs = [...dirs, join(app.getPath('userData'), 'images')]
    const scanned = new Set<string>()
    // 先收集候选路径（受上限约束），再并行 stat，避免 5000 张图片时串行
    // 5000 次系统调用造成的明显延迟（Node Dirent 不携带 size，仍需 stat）。
    const candidates: { path: string; name: string }[] = []
    for (const dir of imageDirs) {
      if (scanned.has(dir)) continue
      scanned.add(dir)
      try {
        // L2：不再对任意传入目录授信。图片目录都是工作区/文档目录或
        // userData/images 的子路径，打开文档/工作区与保存图片时已授信，
        // 信任根对子路径自动覆盖，此处无需（也不应）扩展授权。
        const entries = await readdir(dir, { withFileTypes: true })
        for (const e of entries) {
          if (!e.isFile()) continue
          if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(e.name)) continue
          candidates.push({ path: join(dir, e.name), name: e.name })
          if (candidates.length >= MAX_IMAGE_LIST_COUNT) break
        }
        if (candidates.length >= MAX_IMAGE_LIST_COUNT) break
      } catch {
        /* 目录不存在则跳过 */
      }
    }
    const stats = await Promise.all(
      candidates.map((c) => stat(c.path).catch(() => null)),
    )
    for (let i = 0; i < candidates.length; i++) {
      images.push({
        path: candidates[i].path,
        name: candidates[i].name,
        size: stats[i]?.size ?? 0,
      })
    }
    return { ok: true, data: { images, truncated: candidates.length >= MAX_IMAGE_LIST_COUNT } }
  })

  // 删除图片（移入回收站）
  ipcMain.handle(CHANNELS.FILE_DELETE_IMAGE, async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    // 仅允许图片扩展名（与 FILE_LIST_IMAGES/图片保存同口径）：图片目录白名单
    // 覆盖所有已打开文档的目录，不限扩展名会绕过 FILE_DELETE 的工作区绑定
    // 删除同目录的任意文件
    if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(basename(filePath))) {
      return { ok: false, error: { code: 'NOT_IMAGE' } }
    }
    // 与 FILE_LIST_IMAGES 同口径：图片读取白名单目录（拖入/会话恢复的 .md
    // 只授"图片读取"范围）内的图片同样允许移入回收站——此前仅认完整信任根，
    // 面板能列出（白名单放行）但删除被 INVALID_PATH 拒绝，出现"能看不能删"
    if (!isTrustedPath(filePath) && !isImageDirAllowed(filePath)) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    try {
      // M3：仅允许删除文件（同 FILE_DELETE）
      const st = await stat(filePath)
      if (!st.isFile()) {
        return { ok: false, error: { code: 'NOT_FILE' } }
      }
      await shell.trashItem(filePath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
    }
  })
}
