import { app, ipcMain, shell } from 'electron'
import { mkdir, readdir, stat, writeFile } from 'fs/promises'
import { basename, join } from 'path'
import { CHANNELS } from '../../shared/ipc/channels'
import {
  allowImageDirectory,
  isImageDirAllowed,
  isImagePathAllowedAfterResolvingLinks,
} from '../image-protocol'
import { schedulePersistTrust } from '../session-trust'
import { isPathAuthorizedForReadOrSave, isPathTrustedAfterResolvingLinks } from '../trusted-paths'
import { normalizeAttachmentDirectory, resolveAttachmentDirectory } from './attachment-path'
import { isValidBase64Payload, MAX_IMAGE_BASE64_LENGTH, MAX_IMAGE_SIZE } from './image-payload'

const MAX_IMAGE_LIST_DIRS = 20
const MAX_IMAGE_LIST_COUNT = 1000

export interface ImageFileHandlerDependencies {
  isTrustedPath(candidate: unknown): boolean
}

/**
 * 图片文件相关 IPC 与文档读写分离：这里仅负责图片落盘、枚举和回收站删除，
 * 保持原有的授权、载荷限制与错误码边界。
 */
export const registerImageFileHandlers = ({ isTrustedPath }: ImageFileHandlerDependencies): void => {
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
        if (args.docPath && !(await isPathAuthorizedForReadOrSave(args.docPath))) {
          return { ok: false, error: { code: 'INVALID_PATH' } }
        }
        if (args.workspacePath && !(await isPathTrustedAfterResolvingLinks(args.workspacePath))) {
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
        const directory = args.docPath || args.workspacePath
          ? resolution.directory
          : join(app.getPath('userData'), 'images')
        if (!isTrustedPath(directory) && !isImageDirAllowed(directory)) {
          return { ok: false, error: { code: 'INVALID_PATH' } }
        }
        await mkdir(directory, { recursive: true })
        if (!(await isImagePathAllowedAfterResolvingLinks(directory))) {
          return { ok: false, error: { code: 'INVALID_PATH' } }
        }
        let name = ''
        let filePath = ''
        let created = false
        for (let attempt = 0; attempt < 100; attempt++) {
          name = `image-${Date.now()}-${Math.floor(Math.random() * 1e4)}.${ext}`
          filePath = join(directory, name)
          try {
            // mkdir 后目录仍可能被替换为链接；每次实际写入前复核真实目录。
            if (!(await isImagePathAllowedAfterResolvingLinks(directory))) {
              return { ok: false, error: { code: 'INVALID_PATH' } }
            }
            await writeFile(filePath, buffer, { flag: 'wx' })
            created = true
            break
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          }
        }
        if (!created) {
          return { ok: false, error: { code: 'NAME_EXHAUSTED' } }
        }
        allowImageDirectory(directory)
        schedulePersistTrust()
        const relativePath = args.docPath
          ? `${resolution.relativeToDocument}/${name}`.replace(/^\.\//, '')
          : undefined
        return {
          ok: true,
          data: relativePath ? { path: filePath, name, relativePath } : { path: filePath, name },
        }
      } catch (error) {
        return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
      }
    },
  )

  ipcMain.handle(CHANNELS.FILE_LIST_IMAGES, async (_event, directories: string[]) => {
    if (
      !Array.isArray(directories) ||
      directories.length > MAX_IMAGE_LIST_DIRS ||
      directories.some(
        (directory) =>
          typeof directory !== 'string' ||
          !directory ||
          directory.length > 4096 ||
          (!isTrustedPath(directory) && !isImageDirAllowed(directory)),
      )
    ) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
    }
    const authorizedDirectories = await Promise.all(
      directories.map((directory) => isImagePathAllowedAfterResolvingLinks(directory)),
    )
    if (authorizedDirectories.some((authorized) => !authorized)) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
    }
    const images: { path: string; name: string; size: number }[] = []
    const imageDirectories = [...directories, join(app.getPath('userData'), 'images')]
    const scanned = new Set<string>()
    const candidates: { path: string; name: string }[] = []
    for (const directory of imageDirectories) {
      if (scanned.has(directory)) continue
      scanned.add(directory)
      try {
        // 应用自有图片目录同样可能在运行时被替换为链接，不能因它不是 IPC
        // 入参就跳过真实路径校验。
        if (!(await isImagePathAllowedAfterResolvingLinks(directory))) continue
        const entries = await readdir(directory, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isFile()) continue
          if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(entry.name)) continue
          const candidate = join(directory, entry.name)
          if (!(await isImagePathAllowedAfterResolvingLinks(candidate))) continue
          candidates.push({ path: candidate, name: entry.name })
          if (candidates.length >= MAX_IMAGE_LIST_COUNT) break
        }
        if (candidates.length >= MAX_IMAGE_LIST_COUNT) break
      } catch {
        // 目录不存在或不可读时跳过其候选项，保留其余已授权目录的可见结果。
      }
    }
    const stats = await Promise.all(candidates.map((candidate) => stat(candidate.path).catch(() => null)))
    for (let index = 0; index < candidates.length; index++) {
      images.push({
        path: candidates[index].path,
        name: candidates[index].name,
        size: stats[index]?.size ?? 0,
      })
    }
    return { ok: true, data: { images, truncated: candidates.length >= MAX_IMAGE_LIST_COUNT } }
  })

  ipcMain.handle(CHANNELS.FILE_DELETE_IMAGE, async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    if (!/\.(png|jpe?g|gif|webp|bmp)$/i.test(basename(filePath))) {
      return { ok: false, error: { code: 'NOT_IMAGE' } }
    }
    if (!(await isImagePathAllowedAfterResolvingLinks(filePath))) {
      return { ok: false, error: { code: 'INVALID_PATH' } }
    }
    try {
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) {
        return { ok: false, error: { code: 'NOT_FILE' } }
      }
      if (!(await isImagePathAllowedAfterResolvingLinks(filePath))) {
        return { ok: false, error: { code: 'INVALID_PATH' } }
      }
      await shell.trashItem(filePath)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })
}
