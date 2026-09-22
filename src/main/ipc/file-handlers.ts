import { BrowserWindow, dialog, ipcMain } from 'electron'
import { lstat, stat } from 'fs/promises'
import { basename, dirname } from 'path'
import { CHANNELS } from '../../shared/ipc/channels'
import { isValidContentHash } from '../../shared/document-version'
import { allowImageDirectory, readImageAsDataUrl } from '../image-protocol'
import { schedulePersistTrust } from '../session-trust'
import { createSaveAsWriteTargetAuthorizer, getWriteTargetAuthorizer, isPathAuthorizedForReadOrSave, trustFileForSave } from '../trusted-paths'
import type { DocumentSaveArgs, DocumentSaveEncoding, DocumentSaveResult } from './document-save-types'
import { enqueueDocumentSave } from './document-save-handler'
import {
  encodedDocumentByteLength,
  MAX_DOCUMENT_FILE_SIZE,
  MAX_EXPORT_FILE_SIZE,
  FileWriteRecoveryPendingError,
  FileIdentityChangedError,
  readTextAutoEncoding,
  readRegularFileBuffer,
  recoverInterruptedFileWrite,
  rememberFileState,
  sha256Hex,
  UnsupportedEncodingError,
  writeFileAtomically,
} from './file-io'
import { registerImageFileHandlers } from './image-file-handlers'
import { recordSupportIpcFailure, trackSupportIpcResult } from '../support/support-ipc-tracking'

const MAX_CSS_FILE_SIZE = 1024 * 1024
const SAVE_ENCODINGS: ReadonlySet<DocumentSaveEncoding> = new Set(['UTF-8', 'UTF-8-BOM', 'UTF-16LE', 'UTF-16BE', 'GBK'] as const)

export interface FileHandlerDependencies {
  isTrustedPath(candidate: unknown): boolean
}

export const registerFileHandlers = ({ isTrustedPath }: FileHandlerDependencies): void => {
  registerImageFileHandlers({ isTrustedPath })
  const readDocumentAtPath = async (
    filePath: string,
    isTargetAuthorized?: (target: string) => Promise<boolean>,
  ): Promise<
    | {
        ok: true
        data: {
          path: string
          name: string
          content: string
          modifiedTime: number
          size: number
          contentSha256: string
          encoding: string
        }
      }
    | { ok: false; error: { code: string; message?: string } }
  > => {
    const readFail = (error: { code: string; message?: string }) => {
      recordSupportIpcFailure(error.code)
      return { ok: false as const, error }
    }
    try {
      // Recovery must run before stat: copyFile may remove its destination
      // after an interrupted overwrite, leaving only the verified backup.
      await recoverInterruptedFileWrite(filePath, { isTargetAuthorized })
      if (isTargetAuthorized && !(await isTargetAuthorized(filePath))) {
        return readFail({ code: 'NOT_AUTHORIZED' })
      }
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) {
        return readFail({ code: 'NOT_FILE' })
      }
      if (fileStat.size > MAX_DOCUMENT_FILE_SIZE) {
        return readFail({ code: 'TOO_LARGE', message: 'Markdown 文件超过 20MB，无法打开' })
      }
      if (isTargetAuthorized && !(await isTargetAuthorized(filePath))) {
        return readFail({ code: 'NOT_AUTHORIZED' })
      }
      const { content, encoding, contentSha256 } = await readTextAutoEncoding(filePath, { isTargetAuthorized })
      const afterRead = await stat(filePath)
      rememberFileState(filePath, { mtimeMs: afterRead.mtimeMs, size: afterRead.size, contentSha256 })
      return {
        ok: true,
        data: {
          path: filePath,
          name: filePath.split(/[/\\]/).pop() || 'untitled.md',
          content,
          modifiedTime: afterRead.mtimeMs,
          size: afterRead.size,
          contentSha256,
          encoding,
        },
      }
    } catch (error) {
      if (error instanceof FileWriteRecoveryPendingError) {
        return readFail({ code: 'FILE_BUSY', message: error.message })
      }
      if (error instanceof UnsupportedEncodingError) {
        return readFail({ code: 'UNSUPPORTED_ENCODING', message: error.message })
      }
      if (error instanceof FileIdentityChangedError) {
        return readFail({ code: 'NOT_AUTHORIZED', message: error.message })
      }
      return readFail({ code: 'IO_ERROR', message: String(error) })
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
    // 对话框只表示用户要打开这一篇。父目录获得图片读取；写权限只给这个文件。
    // 整目录写入要走“打开文件夹”。
    allowImageDirectory(dirname(filePath))
    await trustFileForSave(filePath)
    schedulePersistTrust()
    return readDocumentAtPath(filePath, getWriteTargetAuthorizer(filePath))
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
    if (!(await isPathAuthorizedForReadOrSave(filePath))) {
      return {
        ok: false,
        error: {
          code: 'NOT_AUTHORIZED',
          message: '该文件未在本应用中授权，请通过打开对话框、拖拽或工作区重新打开',
        },
      }
    }
    return readDocumentAtPath(filePath, getWriteTargetAuthorizer(filePath))
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
      await trustFileForSave(filePath)
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
      // 选 CSS 只读取这一份内容用于主题/导出预览，不能把所在目录变成信任根。
      // stat 会跟随链接，必须先看 lstat，避免对话框返回后路径被换成别的文件。
      const linkStat = await lstat(filePath)
      if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
        return { ok: false, error: { code: 'IO_ERROR', message: '选择的不是普通文件' } }
      }
      if (linkStat.size > MAX_CSS_FILE_SIZE) {
        return { ok: false, error: { code: 'TOO_LARGE', message: 'CSS 文件过大（>1MB）' } }
      }
      const bytes = await readRegularFileBuffer(filePath)
      const content = bytes.toString('utf-8')
      if (bytes.length > MAX_CSS_FILE_SIZE) {
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

  // 保存文件（带版本冲突检测：请求自身的 expectedMtime + expectedContentHash）
  ipcMain.handle(
    CHANNELS.FILE_SAVE,
    async (_event, args: DocumentSaveArgs): Promise<DocumentSaveResult> => {
      if (
        !args ||
        typeof args !== 'object' ||
        typeof args.path !== 'string' ||
        typeof args.content !== 'string'
      ) {
        return trackSupportIpcResult({ ok: false, error: { code: 'INVALID_ARGUMENT' } }, { failureEvent: 'save_failed' })
      }
      if (
        args.encoding !== undefined &&
        !SAVE_ENCODINGS.has(args.encoding as DocumentSaveEncoding)
      ) {
        return trackSupportIpcResult({ ok: false, error: { code: 'INVALID_ARGUMENT' } }, { failureEvent: 'save_failed' })
      }
      if (args.forceOverwrite !== undefined && typeof args.forceOverwrite !== 'boolean') {
        return trackSupportIpcResult({ ok: false, error: { code: 'INVALID_ARGUMENT' } }, { failureEvent: 'save_failed' })
      }
      if (
        args.expectedContentHash !== undefined
        && args.expectedContentHash !== null
        && !isValidContentHash(args.expectedContentHash)
      ) {
        return trackSupportIpcResult({ ok: false, error: { code: 'INVALID_ARGUMENT' } }, { failureEvent: 'save_failed' })
      }
      try {
        if (!(await isPathAuthorizedForReadOrSave(args.path))) {
          return trackSupportIpcResult({ ok: false, error: { code: 'INVALID_PATH' } }, { failureEvent: 'save_failed' })
        }
        if (encodedDocumentByteLength(args.content ?? '', args.encoding) > MAX_DOCUMENT_FILE_SIZE) {
          return trackSupportIpcResult(
            { ok: false, error: { code: 'TOO_LARGE', message: 'Markdown 文件超过 20MB，无法保存' } },
            { failureEvent: 'save_failed' },
          )
        }
        return await enqueueDocumentSave(args)
      } catch (err) {
        return trackSupportIpcResult(
          { ok: false, error: { code: 'IO_ERROR', message: String(err) } },
          { failureEvent: 'save_failed' },
        )
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

      const content = args?.content
      if (typeof content !== 'string') {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
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
        const isTargetAuthorized = await createSaveAsWriteTargetAuthorizer(result.filePath)
        if (!isTargetAuthorized) {
          return { ok: false, error: { code: 'INVALID_PATH' } }
        }
        await writeFileAtomically(result.filePath, content, undefined, { isTargetAuthorized })
        allowImageDirectory(dirname(result.filePath))
        await trustFileForSave(result.filePath)
        schedulePersistTrust()
        let modifiedTime = 0
        let size = 0
        let contentSha256 = sha256Hex(content)
        try {
          const fileStat = await stat(result.filePath)
          modifiedTime = fileStat.mtimeMs
          size = fileStat.size
          contentSha256 = sha256Hex(content)
          rememberFileState(result.filePath, {
            mtimeMs: fileStat.mtimeMs,
            size: fileStat.size,
            contentSha256,
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
            size,
            contentSha256,
          },
        }
      } catch (err) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
      }
    },
  )
}
