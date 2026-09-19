import { createHash } from 'crypto'
import { open, readdir, lstat } from 'fs/promises'
import type { Dirent } from 'fs'
import { join } from 'path'
import iconv from 'iconv-lite'
import { isPathAuthorizedForReadOrSave } from '../trusted-paths'
import type { DocumentSaveEncoding } from './document-save-types'
import { recoverInterruptedFileWrite } from './file-write-recovery'
export {
  FileWriteRecoveryError,
  FileWriteRecoveryPendingError,
  recoverInterruptedFileWrite,
  shouldPreserveFileIdentity,
  writeFileAtomically,
  writeFileAtomicallyWithIo,
} from './file-write-recovery'

const MAX_FILE_STATE_ENTRIES = 4096
const MAX_TREE_DEPTH = 5
const MAX_TREE_NODES = 2000

export interface KnownFileState {
  mtimeMs: number
  size: number
  contentSha256?: string
}

const lastKnownFileState = new Map<string, KnownFileState>()

export const sha256Hex = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex')

/**
 * mtime/尺寸对 cp -p、FAT 同时间片和等长替换不够用。已知内容哈希且尚未判定冲突时，
 * 调用方应再哈希当前磁盘字节。
 */
export const inspectSaveConflict = (input: {
  current: { mtimeMs: number; size: number }
  expectedMtime: number | null
  known?: KnownFileState
  currentSha256?: string
}): { conflict: boolean; needsContentHash: boolean } => {
  const { current, expectedMtime, known, currentSha256 } = input
  if (expectedMtime !== null && current.mtimeMs > expectedMtime + 500) {
    return { conflict: true, needsContentHash: false }
  }
  if (known && (current.size !== known.size || current.mtimeMs > known.mtimeMs + 500)) {
    return { conflict: true, needsContentHash: false }
  }
  if (known?.contentSha256 && !currentSha256) {
    return { conflict: false, needsContentHash: true }
  }
  if (known?.contentSha256 && currentSha256 && currentSha256 !== known.contentSha256) {
    return { conflict: true, needsContentHash: false }
  }
  return { conflict: false, needsContentHash: false }
}

export interface FolderTreeNode {
  name: string
  path: string
  children?: FolderTreeNode[]
}

export interface TreeBudget {
  nodes: number
  truncated: boolean
  /** 后台扫描可用的文件计数；未设置 maxFiles 时不参与默认 UI 树预算。 */
  files?: number
}

/**
 * 调用方可为后台扫描扩大节点预算，但工作区文件树仍保持默认上限，避免
 * 把完整大库意外塞进 Renderer。深度限制是安全/交互约束，不应由搜索放宽。
 */
export interface TreeWalkLimits {
  maxNodes?: number
  /** 文件数量预算；与 maxNodes 分离，避免目录节点挤占后台搜索的文件覆盖量。 */
  maxFiles?: number
}

export class UnsupportedEncodingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedEncodingError'
  }
}

/** 路径在 lstat 与打开句柄之间被换成符号链接或另一个文件。 */
export class FileIdentityChangedError extends Error {
  constructor() {
    super('文件在读取期间被替换')
    this.name = 'FileIdentityChangedError'
  }
}

/** 只读取与 lstat 同一 inode 的普通文件，避免授权后路径被换成链接再被跟随。 */
export const readRegularFileBuffer = async (filePath: string): Promise<Buffer> => {
  const linkStat = await lstat(filePath)
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) throw new FileIdentityChangedError()
  const handle = await open(filePath, 'r')
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.dev !== linkStat.dev || opened.ino !== linkStat.ino) {
      throw new FileIdentityChangedError()
    }
    return Buffer.from(await handle.readFile())
  } finally {
    await handle.close()
  }
}

export const rememberFileState = (
  path: string,
  state: KnownFileState,
): void => {
  if (lastKnownFileState.has(path)) {
    lastKnownFileState.set(path, state)
    return
  }
  if (lastKnownFileState.size >= MAX_FILE_STATE_ENTRIES) {
    const oldest = lastKnownFileState.keys().next().value
    if (oldest !== undefined) lastKnownFileState.delete(oldest)
  }
  lastKnownFileState.set(path, state)
}

export const getKnownFileState = (
  path: string,
): KnownFileState | undefined => lastKnownFileState.get(path)

export const forgetKnownFileState = (path: string): void => {
  lastKnownFileState.delete(path)
}

/** 重命名/移动不改内容。尺寸一致时把内容哈希带到新路径，避免下次保存丢掉冲突基线。 */
export const carryKnownFileState = (
  from: string,
  to: string,
  next: { mtimeMs: number; size: number },
): void => {
  const previous = getKnownFileState(from)
  forgetKnownFileState(from)
  rememberFileState(to, {
    mtimeMs: next.mtimeMs,
    size: next.size,
    contentSha256: previous?.size === next.size ? previous.contentSha256 : undefined,
  })
}

/** 单篇 Markdown 文档读取/保存上限，避免误选超大文件拖垮主进程与编辑器 */
export const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024

/** 按实际落盘编码计算体积；UTF-16 约为 UTF-8 的两倍，不能用 UTF-8 字节数当上限。 */
export const encodedDocumentByteLength = (
  content: string,
  encoding?: DocumentSaveEncoding,
): number => {
  if (encoding === 'UTF-16LE' || encoding === 'UTF-16BE') {
    return 2 + Buffer.byteLength(content, 'utf16le')
  }
  if (encoding === 'UTF-8-BOM') return 3 + Buffer.byteLength(content, 'utf-8')
  if (encoding === 'GBK') return iconv.encode(content, 'gbk').length
  return Buffer.byteLength(content, 'utf-8')
}

/** 导出载荷上限（PDF/HTML 等）：内联 base64 图片后远超原文，放宽到 100MB 仅防失控写出 */
export const MAX_EXPORT_FILE_SIZE = 100 * 1024 * 1024

const detectUtf16NoBom = (buf: Buffer): 'UTF-16LE' | 'UTF-16BE' | null => {
  if (buf.length < 4 || buf.length % 2 !== 0) return null
  const sampleLen = Math.min(buf.length, 8192)
  let evenZeros = 0
  let oddZeros = 0
  const pairs = Math.floor(sampleLen / 2)
  for (let i = 0; i < pairs; i++) {
    if (buf[i * 2] === 0) evenZeros++
    if (buf[i * 2 + 1] === 0) oddZeros++
  }
  const le = oddZeros / pairs
  const be = evenZeros / pairs
  if (le >= 0.3 && be <= 0.05) return 'UTF-16LE'
  if (be >= 0.3 && le <= 0.05) return 'UTF-16BE'
  return null
}

const tryUtf16ByZeroBytes = (buf: Buffer): { content: string; encoding: string } | null => {
  if (buf.length < 4 || buf.length % 2 !== 0) return null
  let oddZeros = 0
  let evenZeros = 0
  let oddSurrogates = 0
  let evenSurrogates = 0
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i]
    if (byte === 0) {
      if (i % 2 === 0) evenZeros++
      else oddZeros++
    } else if (byte >= 0xd8 && byte <= 0xdf) {
      if (i % 2 === 0) evenSurrogates++
      else oddSurrogates++
    }
  }
  if (oddSurrogates > evenSurrogates * 2 && oddSurrogates >= 2) {
    return { content: buf.toString('utf16le'), encoding: 'UTF-16LE' }
  }
  if (evenSurrogates > oddSurrogates * 2 && evenSurrogates >= 2) {
    return { content: iconv.decode(buf, 'utf-16be'), encoding: 'UTF-16BE' }
  }
  if (oddZeros > evenZeros * 3 && oddZeros >= 2) {
    return { content: buf.toString('utf16le'), encoding: 'UTF-16LE' }
  }
  if (evenZeros > oddZeros * 3 && evenZeros >= 2) {
    return { content: iconv.decode(buf, 'utf-16be'), encoding: 'UTF-16BE' }
  }
  return null
}

/** 文件以合法 UTF-8 开头但在末尾截断多字节序列时，不能再猜成 GBK。 */
export const isIncompleteUtf8Sequence = (buf: Buffer): boolean => {
  let index = 0
  while (index < buf.length) {
    const byte = buf[index]!
    if (byte <= 0x7f) {
      index += 1
      continue
    }
    let needed = 0
    if (byte >= 0xc2 && byte <= 0xdf) needed = 1
    else if (byte >= 0xe0 && byte <= 0xef) needed = 2
    else if (byte >= 0xf0 && byte <= 0xf4) needed = 3
    else return false
    if (index + needed >= buf.length) return true
    for (let offset = 1; offset <= needed; offset += 1) {
      const next = buf[index + offset]!
      if (next < 0x80 || next > 0xbf) return false
    }
    index += 1 + needed
  }
  return false
}

const tryDecodeGbk = (buf: Buffer): string | null => {
  if (isIncompleteUtf8Sequence(buf)) return null
  const content = iconv.decode(buf, 'gbk')
  if (content.includes('\u0000') || content.includes('\uFFFD')) return null
  const roundTrip = iconv.encode(content, 'gbk')
  if (!Buffer.from(roundTrip).equals(buf)) return null
  return content
}

export const decodeTextBuffer = (
  buf: Buffer,
): { content: string; encoding: string; contentSha256: string } => {
  const contentSha256 = sha256Hex(buf)
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xfe && buf[2] === 0x00 && buf[3] === 0x00) {
    throw new UnsupportedEncodingError('UTF-32LE 编码暂不支持，请先转为 UTF-8')
  }
  if (buf.length >= 4 && buf[0] === 0xfe && buf[1] === 0xff && buf[2] === 0x00 && buf[3] === 0x00) {
    throw new UnsupportedEncodingError('UTF-32BE 编码暂不支持，请先转为 UTF-8')
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { content: buf.subarray(2).toString('utf16le'), encoding: 'UTF-16LE', contentSha256 }
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { content: iconv.decode(buf.subarray(2), 'utf-16be'), encoding: 'UTF-16BE', contentSha256 }
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { content: buf.subarray(3).toString('utf-8'), encoding: 'UTF-8-BOM', contentSha256 }
  }
  const utf16 = detectUtf16NoBom(buf)
  if (utf16 === 'UTF-16LE') {
    return { content: buf.toString('utf16le'), encoding: 'UTF-16LE', contentSha256 }
  }
  if (utf16 === 'UTF-16BE') {
    return { content: iconv.decode(buf, 'utf-16be'), encoding: 'UTF-16BE', contentSha256 }
  }
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    if (content.includes('\u0000')) {
      const zero = tryUtf16ByZeroBytes(buf)
      if (zero) return { ...zero, contentSha256 }
    }
    return { content, encoding: 'UTF-8', contentSha256 }
  } catch {
    const zero = tryUtf16ByZeroBytes(buf)
    if (zero) return { ...zero, contentSha256 }
    const gbk = tryDecodeGbk(buf)
    if (gbk !== null) return { content: gbk, encoding: 'GBK', contentSha256 }
    throw new UnsupportedEncodingError('无法识别文件编码，请先转为 UTF-8')
  }
}

export const readTextAutoEncoding = async (
  filePath: string,
  options?: { isTargetAuthorized?: (target: string) => Promise<boolean> },
): Promise<{ content: string; encoding: string; contentSha256: string }> => {
  // A crashed in-place desktop save may leave a verified recovery journal.
  // Recover before any reader (open, index, history) consumes a partial file.
  // 未授权路径跳过会写盘的恢复，避免索引把 backup 写到信任根外。
  await recoverInterruptedFileWrite(filePath, {
    isTargetAuthorized: options?.isTargetAuthorized ?? isPathAuthorizedForReadOrSave,
  })
  return decodeTextBuffer(await readRegularFileBuffer(filePath))
}

export const isTraversableWorkspaceDirectory = async (
  directory: string,
  entry: Dirent,
): Promise<boolean> => {
  if (entry.name.startsWith('.') || entry.name === 'node_modules') return false
  if (entry.isSymbolicLink() || !entry.isDirectory()) return false
  const stats = await lstat(join(directory, entry.name)).catch(() => null)
  return Boolean(stats?.isDirectory() && !stats.isSymbolicLink())
}

export const walkMarkdownTree = async (
  dir: string,
  depth: number,
  budget: TreeBudget,
  limits: TreeWalkLimits = {},
): Promise<FolderTreeNode[]> => {
  const maxNodes = limits.maxNodes ?? (limits.maxFiles === undefined ? MAX_TREE_NODES : Number.POSITIVE_INFINITY)
  const maxFiles = limits.maxFiles
  const reachedFileLimit = (): boolean =>
    maxFiles !== undefined && (budget.files ?? 0) >= maxFiles
  if (depth > MAX_TREE_DEPTH || budget.truncated || reachedFileLimit()) return []
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const byName = (left: { name: string }, right: { name: string }) =>
    left.name.localeCompare(right.name, 'zh-CN')
  const dirs: Dirent[] = []
  for (const entry of entries) {
    if (await isTraversableWorkspaceDirectory(dir, entry)) dirs.push(entry)
  }
  dirs.sort(byName)
  const files = entries
    .filter((entry) => !entry.isSymbolicLink() && entry.isFile() && /\.(md|markdown)$/i.test(entry.name))
    .sort(byName)

  const nodes: FolderTreeNode[] = []
  for (const entry of dirs) {
    if (budget.truncated || reachedFileLimit()) break
    const children = await walkMarkdownTree(join(dir, entry.name), depth + 1, budget, limits)
    if (children.length === 0) continue
    nodes.push({ name: entry.name, path: join(dir, entry.name), children })
    budget.nodes++
    if (budget.nodes >= maxNodes) {
      budget.truncated = true
      break
    }
  }
  if (budget.truncated || reachedFileLimit()) return nodes
  for (const entry of files) {
    if (reachedFileLimit()) break
    nodes.push({ name: entry.name, path: join(dir, entry.name) })
    budget.nodes++
    budget.files = (budget.files ?? 0) + 1
    if (budget.nodes >= maxNodes || reachedFileLimit()) {
      budget.truncated = true
      break
    }
  }
  return nodes
}
