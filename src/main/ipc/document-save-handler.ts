import { stat } from 'fs/promises'
import iconv from 'iconv-lite'
import type { DocumentFileVersion } from '../../shared/document-version'
import { isValidContentHash } from '../../shared/document-version'
import { getWriteTargetAuthorizer } from '../trusted-paths'
import type { DocumentSaveArgs, DocumentSaveResult } from './document-save-types'
import { toDocumentFileVersion } from './document-version-check'
import {
  FileIdentityChangedError,
  getKnownFileState,
  inspectSaveConflict,
  readRegularFileBuffer,
  rememberFileState,
  sha256Hex,
  writeFileAtomically,
} from './file-io'
import { acquireCrossProcessSaveLock, SaveLockIoError } from './save-lock'

/** 同路径并发保存互斥（T-OCTOU）：按 path 串行化 FILE_SAVE 的完整写盘流程 */
const saveLocks = new Map<string, Promise<unknown>>()

const encodeSavePayload = (
  content: string,
  encoding: DocumentSaveArgs['encoding'],
): { payload: string | Uint8Array; error?: DocumentSaveResult } => {
  if (encoding === 'UTF-8-BOM') {
    return { payload: `\uFEFF${content}` }
  }
  if (encoding === 'UTF-16LE' || encoding === 'UTF-16BE') {
    const bom =
      encoding === 'UTF-16LE'
        ? Buffer.from([0xff, 0xfe])
        : Buffer.from([0xfe, 0xff])
    const body =
      encoding === 'UTF-16LE'
        ? Buffer.from(content, 'utf16le')
        : iconv.encode(content, 'utf-16be')
    return { payload: Buffer.concat([bom, body]) }
  }
  if (encoding === 'GBK') {
    const encoded = iconv.encode(content, 'gbk')
    if (iconv.decode(encoded, 'gbk') !== content) {
      return {
        payload: encoded,
        error: {
          ok: false,
          error: {
            code: 'ENCODING_LOSS',
            message: '内容包含 GBK 无法表示的字符',
          },
        },
      }
    }
    return { payload: encoded }
  }
  return { payload: content }
}

/**
 * FILE_SAVE 的完整写盘流程（版本校验 → 编码写回 → 更新基线）。
 * 经 saveLocks 按 path 串行；外层再加跨进程文件锁。
 */
export const performDocumentSave = async (args: DocumentSaveArgs): Promise<DocumentSaveResult> => {
  let releaseLock: (() => Promise<void>) | null = null
  try {
    releaseLock = await acquireCrossProcessSaveLock(args.path)
  } catch (err) {
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
    // 等锁期间信任根可能已被淘汰。授权函数缺失时必须拒绝，不能当成已放行。
    const writeOptions = { isTargetAuthorized: getWriteTargetAuthorizer(args.path) ?? (async () => false) }
    const expectedMtime =
      typeof args.expectedMtime === 'number' && Number.isFinite(args.expectedMtime)
        ? args.expectedMtime
        : null
    const expectedContentHash =
      typeof args.expectedContentHash === 'string' && isValidContentHash(args.expectedContentHash)
        ? args.expectedContentHash
        : null
    const forceOverwrite = args.forceOverwrite === true
    // known 仅作缓存；冲突只认请求自身的 expectedContentHash。
    const known = getKnownFileState(args.path)
    let currentSha256: string | undefined
    let conflictCheck = inspectSaveConflict({
      current: pre,
      expectedMtime,
      expectedContentHash,
      known,
    })
    if (!forceOverwrite && conflictCheck.needsContentHash) {
      try {
        currentSha256 = sha256Hex(await readRegularFileBuffer(args.path))
      } catch (error) {
        if (error instanceof FileIdentityChangedError) {
          return { ok: false, error: { code: 'NOT_AUTHORIZED', message: error.message } }
        }
        throw error
      }
      conflictCheck = inspectSaveConflict({
        current: pre,
        expectedMtime,
        expectedContentHash,
        known,
        currentSha256,
      })
    }
    if (!forceOverwrite && conflictCheck.conflict) {
      return {
        ok: false,
        error: { code: 'CONFLICT', message: '文件已被外部修改' },
      }
    }
    const encoded = encodeSavePayload(args.content, args.encoding)
    if (encoded.error) return encoded.error
    const payload = encoded.payload
    await writeFileAtomically(args.path, payload, pre.mode, writeOptions)
    const fileStat = await stat(args.path)
    const contentSha256 = sha256Hex(payload)
    rememberFileState(args.path, {
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
      contentSha256,
    })
    const version: DocumentFileVersion = toDocumentFileVersion({
      modifiedTime: fileStat.mtimeMs,
      size: fileStat.size,
      contentSha256,
    })
    return {
      ok: true,
      data: {
        modifiedTime: version.modifiedTime,
        size: version.size,
        contentSha256: version.contentSha256,
      },
    }
  } catch (err) {
    return { ok: false, error: { code: 'IO_ERROR', message: String(err) } }
  } finally {
    await releaseLock?.()
  }
}

/** 同路径串行化 performDocumentSave，防止双窗口 OCTOU 覆盖。 */
export const enqueueDocumentSave = async (args: DocumentSaveArgs): Promise<DocumentSaveResult> => {
  const previous = saveLocks.get(args.path) ?? Promise.resolve()
  const task = previous.then(() => performDocumentSave(args))
  const tracked = task.catch(() => undefined)
  saveLocks.set(args.path, tracked)
  try {
    return await task
  } finally {
    if (saveLocks.get(args.path) === tracked) saveLocks.delete(args.path)
  }
}
