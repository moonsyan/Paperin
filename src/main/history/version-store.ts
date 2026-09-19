import { createHash } from 'crypto'
import { lstat, mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { decodeTextBuffer } from '../ipc/file-io'
import { isPathAuthorizedForReadOrSave } from '../trusted-paths'

/* ==================== 本地版本快照存储 ==================== */

/** 每个文件保留的快照上限 */
export const MAX_SNAPSHOTS_PER_FILE = 20
/** 单文件快照总字节数上限（超出淘汰最旧） */
export const MAX_SNAPSHOTS_TOTAL_BYTES = 5 * 1024 * 1024
/** 超过该大小的源文件不做快照（与索引扫描同量级守卫） */
export const MAX_SOURCE_FILE_SIZE = 2 * 1024 * 1024

const SNAPSHOT_NAME_RE = /^(\d{13,})\.md$/

export interface SnapshotMeta {
  /** 快照时间戳（文件名即毫秒 epoch） */
  t: number
  size: number
}

/**
 * 快照目录名：路径哈希（win32 大小写不敏感归一后哈希，
 * 同一文件不同大小写写法指向同一份历史）
 */
export function snapshotDirName(filePath: string): string {
  const key = process.platform === 'win32' ? filePath.toLowerCase() : filePath
  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}

export function snapshotDirFor(root: string, filePath: string): string {
  return join(root, snapshotDirName(filePath))
}

/** 从目录项解析快照时间；非快照命名返回 null */
export function parseSnapshotTime(name: string): number | null {
  const match = SNAPSHOT_NAME_RE.exec(name)
  return match ? Number(match[1]) : null
}

/**
 * 淘汰计划：metas 按新到旧排列，保留前 MAX_SNAPSHOTS_PER_FILE 条且累计字节
 * 不超过 MAX_SNAPSHOTS_TOTAL_BYTES，其余进入删除列表。
 * 纯函数便于测试。
 */
export function planPrune(
  metasNewestFirst: SnapshotMeta[],
  maxCount = MAX_SNAPSHOTS_PER_FILE,
  maxTotalBytes = MAX_SNAPSHOTS_TOTAL_BYTES,
): { keep: SnapshotMeta[]; remove: SnapshotMeta[] } {
  const keep: SnapshotMeta[] = []
  const remove: SnapshotMeta[] = []
  let total = 0
  for (let i = 0; i < metasNewestFirst.length; i++) {
    const meta = metasNewestFirst[i]
    if (keep.length < maxCount && total + meta.size <= maxTotalBytes) {
      keep.push(meta)
      total += meta.size
    } else {
      remove.push(meta)
    }
  }
  return { keep, remove }
}

/** 列出某文件的快照元数据（新到旧）；无历史返回空数组 */
export async function listSnapshots(root: string, filePath: string): Promise<SnapshotMeta[]> {
  const dir = snapshotDirFor(root, filePath)
  const names = await readdir(dir).catch(() => [])
  const metas: SnapshotMeta[] = []
  for (const name of names) {
    const t = parseSnapshotTime(name)
    if (t === null) continue
    let size = 0
    try {
      size = (await stat(join(dir, name))).size
    } catch {
      continue
    }
    metas.push({ t, size })
  }
  return metas.sort((a, b) => b.t - a.t)
}

/**
 * 记录一次保存后的快照。
 * - 源文件超过大小上限或读取失败时静默跳过
 * - 最新快照内容与当前一致时跳过（连续保存不产生重复副本）
 * - 写入后按上限淘汰最旧快照
 * 返回是否实际写入。
 */
/** 打开句柄后核对 inode，避免授权后路径被换成符号链接再被跟随读取。 */
const readRegularFileBytes = async (filePath: string): Promise<Buffer | null> => {
  const linkStat = await lstat(filePath).catch(() => null)
  if (!linkStat || linkStat.isSymbolicLink() || !linkStat.isFile() || linkStat.size > MAX_SOURCE_FILE_SIZE) {
    return null
  }
  if (!(await isPathAuthorizedForReadOrSave(filePath))) return null
  const handle = await open(filePath, 'r').catch(() => null)
  if (!handle) return null
  try {
    const opened = await handle.stat()
    if (
      !opened.isFile()
      || opened.isSymbolicLink()
      || opened.dev !== linkStat.dev
      || opened.ino !== linkStat.ino
      || opened.size > MAX_SOURCE_FILE_SIZE
    ) return null
    return Buffer.from(await handle.readFile())
  } finally {
    await handle.close()
  }
}

export async function recordSnapshot(root: string, filePath: string): Promise<boolean> {
  const bytes = await readRegularFileBytes(filePath)
  if (!bytes) return false
  let content: string
  try {
    ;({ content } = decodeTextBuffer(bytes))
  } catch {
    return false
  }

  const dir = snapshotDirFor(root, filePath)
  await mkdir(dir, { recursive: true })

  // 内容去重：最新快照与本次内容相同则不再追加
  const existing = await listSnapshots(root, filePath)
  if (existing.length > 0) {
    const newest = existing[0]
    try {
      const prev = await readFile(join(dir, `${newest.t}.md`), 'utf8')
      if (prev === content) return false
    } catch {
      /* 读不到就当没有去重依据，继续写入 */
    }
  }

  // 同一毫秒极端冲突时向后找空闲名
  let t = Date.now()
  while (existing.some((m) => m.t === t)) t += 1
  await writeFile(join(dir, `${t}.md`), content, 'utf8')

  // 淘汰超限旧快照（含刚写入的这条一起参与计算）
  const all = await listSnapshots(root, filePath)
  const { remove } = planPrune(all)
  for (const meta of remove) {
    await unlink(join(dir, `${meta.t}.md`)).catch(() => {})
  }
  return true
}

/** 读取指定时间戳的快照内容；不存在抛错由调用方转错误码 */
export async function readSnapshot(root: string, filePath: string, t: number): Promise<string> {
  if (!Number.isFinite(t) || parseSnapshotTime(`${t}.md`) === null) {
    throw new Error('INVALID_SNAPSHOT_TIME')
  }
  const dir = snapshotDirFor(root, filePath)
  // 只允许纯数字文件名，杜绝路径拼接逃逸
  return readFile(join(dir, `${t}.md`), 'utf8')
}

/** 删除某文件的全部历史（删除/移动文件时可调用；目录不存在时静默） */
export async function forgetSnapshots(root: string, filePath: string): Promise<void> {
  await rm(snapshotDirFor(root, filePath), { recursive: true, force: true }).catch(() => {})
}

/**
 * 快照历史随文件重命名/移动迁移到新路径的哈希目录。
 * 目标路径已有自己的历史时保留目标、清理旧目录，避免双份并存；
 * 全程静默失败——快照迁移属清理性操作，不应影响重命名本身的成功。
 */
export async function moveSnapshots(root: string, fromPath: string, toPath: string): Promise<void> {
  const from = snapshotDirFor(root, fromPath)
  const to = snapshotDirFor(root, toPath)
  if (from === to) return
  const targetExists = await stat(to).then(() => true, () => false)
  if (targetExists) {
    await forgetSnapshots(root, fromPath)
    return
  }
  await rename(from, to).catch(() => {})
}
