import { chmod, lstat, readFile, readdir, realpath, rename, unlink, writeFile } from 'fs/promises'
import type { Dirent } from 'fs'
import { basename, dirname, join } from 'path'
import iconv from 'iconv-lite'

const MAX_FILE_STATE_ENTRIES = 4096
const MAX_TREE_DEPTH = 5
const MAX_TREE_NODES = 2000

const lastKnownFileState = new Map<string, { mtimeMs: number; size: number }>()

export interface FolderTreeNode {
  name: string
  path: string
  children?: FolderTreeNode[]
}

export interface TreeBudget {
  nodes: number
  truncated: boolean
}

export class UnsupportedEncodingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedEncodingError'
  }
}

export const rememberFileState = (
  path: string,
  state: { mtimeMs: number; size: number },
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
): { mtimeMs: number; size: number } | undefined => lastKnownFileState.get(path)

export const forgetKnownFileState = (path: string): void => {
  lastKnownFileState.delete(path)
}

/** 单篇 Markdown 文档读取/保存上限，避免误选超大文件拖垮主进程与编辑器 */
export const MAX_DOCUMENT_FILE_SIZE = 20 * 1024 * 1024

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

export const readTextAutoEncoding = async (
  filePath: string,
): Promise<{ content: string; encoding: string }> => {
  const buf = await readFile(filePath)
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xfe && buf[2] === 0x00 && buf[3] === 0x00) {
    throw new UnsupportedEncodingError('UTF-32LE 编码暂不支持，请先转为 UTF-8')
  }
  if (buf.length >= 4 && buf[0] === 0xfe && buf[1] === 0xff && buf[2] === 0x00 && buf[3] === 0x00) {
    throw new UnsupportedEncodingError('UTF-32BE 编码暂不支持，请先转为 UTF-8')
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { content: buf.subarray(2).toString('utf16le'), encoding: 'UTF-16LE' }
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { content: iconv.decode(buf.subarray(2), 'utf-16be'), encoding: 'UTF-16BE' }
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { content: buf.subarray(3).toString('utf-8'), encoding: 'UTF-8-BOM' }
  }
  const utf16 = detectUtf16NoBom(buf)
  if (utf16 === 'UTF-16LE') {
    return { content: buf.toString('utf16le'), encoding: 'UTF-16LE' }
  }
  if (utf16 === 'UTF-16BE') {
    return { content: iconv.decode(buf, 'utf-16be'), encoding: 'UTF-16BE' }
  }
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    if (content.includes('\u0000')) {
      const zero = tryUtf16ByZeroBytes(buf)
      if (zero) return zero
    }
    return { content, encoding: 'UTF-8' }
  } catch {
    const content = new TextDecoder('gbk').decode(buf)
    if (content.includes('\u0000')) {
      const zero = tryUtf16ByZeroBytes(buf)
      if (zero) return zero
    }
    return { content, encoding: 'GBK' }
  }
}

export const writeFileAtomically = async (
  filePath: string,
  content: string | Uint8Array,
  mode?: number,
): Promise<void> => {
  let target = filePath
  try {
    const linkStat = await lstat(filePath)
    if (linkStat.isSymbolicLink()) {
      const real = await realpath(filePath).catch(() => null)
      if (real) target = real
    }
  } catch {
    // 文件不存在则按普通文件处理。
  }
  const tempPath = join(
    dirname(target),
    `.${basename(target)}.${process.pid}-${Date.now()}-${Math.random()}.tmp`,
  )
  try {
    await writeFile(tempPath, content)
    if (mode !== undefined && process.platform !== 'win32') {
      await chmod(tempPath, mode & 0o777).catch(() => {})
    }
    await rename(tempPath, target)
  } catch (error) {
    await unlink(tempPath).catch(() => {})
    throw error
  }
}

export const walkMarkdownTree = async (
  dir: string,
  depth: number,
  budget: TreeBudget,
): Promise<FolderTreeNode[]> => {
  if (depth > MAX_TREE_DEPTH || budget.truncated) return []
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const byName = (left: { name: string }, right: { name: string }) =>
    left.name.localeCompare(right.name, 'zh-CN')
  const dirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .sort(byName)
  const files = entries
    .filter((entry) => entry.isFile() && /\.(md|markdown)$/i.test(entry.name))
    .sort(byName)

  const nodes: FolderTreeNode[] = []
  for (const entry of dirs) {
    if (budget.truncated) break
    const children = await walkMarkdownTree(join(dir, entry.name), depth + 1, budget)
    if (children.length === 0) continue
    nodes.push({ name: entry.name, path: join(dir, entry.name), children })
    budget.nodes++
    if (budget.nodes >= MAX_TREE_NODES) {
      budget.truncated = true
      break
    }
  }
  if (budget.truncated) return nodes
  for (const entry of files) {
    nodes.push({ name: entry.name, path: join(dir, entry.name) })
    budget.nodes++
    if (budget.nodes >= MAX_TREE_NODES) {
      budget.truncated = true
      break
    }
  }
  return nodes
}
