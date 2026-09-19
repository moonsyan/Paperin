import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  getEssentialRoots,
  getPinnedTrustRoot,
  getTrustedFiles,
  MAX_TRUSTED_FILES,
  MAX_TRUSTED_ROOTS,
  restorePinnedTrustRoot,
  trustDirectory,
  trustFileForSave,
} from './trusted-paths'
import {
  allowImageDirectory,
  getImageReadDirs,
  getPinnedImageDir,
  MAX_IMAGE_READ_DIRS,
  restorePinnedImageDir,
} from './image-protocol'

/**
 * 跨启动信任持久化（H：会话预信任伪造）。
 * 会话恢复的信任此前直接采信渲染层可写的 settings.json（session.workspacePath），
 * 渲染层一旦被 XSS，可伪造路径使任意目录（如 C:\）在重启后获得完整信任。
 * 本模块把信任清单改为主进程私有文件（userData/trusted-roots.json）：
 * 只有主进程在用户真实授权后（对话框选择 / 拖入读取 / 保存图片）才登记并写盘，
 * 渲染层没有任何 IPC 能写入该文件。
 */

const TRUST_FILE_NAME = 'trusted-roots.json'
/** 持久化工作区上限：保留最近打开的若干个，防止长期使用后清单无界增长；
 *  始终不超过运行时信任根容量（MAX_TRUSTED_ROOTS） */
export const MAX_PERSISTED_WORKSPACES = Math.min(8, MAX_TRUSTED_ROOTS)
/**
 * 持久化上限单一来源规则：files / imageDirs 直接引用各 owning 模块导出的
 * 运行时上限（trusted-paths.ts、image-protocol.ts），杜绝两处硬编码漂移。
 * 约束：持久化上限必须 ≤ 运行时上限——恢复时超出的部分会被运行时淘汰
 * 逻辑立即驱逐。曾出现持久化 256 > 运行时 128，恢复顺序靠前的文件全部
 * 失效，且运行时满员后每开一个新文件就再淘汰一个，用户已授权的信任在
 * 重启后悄悄丢失。
 */
export const MAX_PERSISTED_FILES = MAX_TRUSTED_FILES
export const MAX_PERSISTED_IMAGE_DIRS = MAX_IMAGE_READ_DIRS

interface TrustSnapshot {
  workspaces: string[]
  files: string[]
  imageDirs: string[]
  /** 词法工作区根 → 首次解析钉住的真实路径。缺省时按旧快照，第一次访问再钉。 */
  pinnedRoots?: Record<string, string>
  /** 图片读取白名单目录 → 首次解析钉住的真实路径。 */
  pinnedImageDirs?: Record<string, string>
}

const trustFile = (): string => join(app.getPath('userData'), TRUST_FILE_NAME)

/** 启动时从主进程私有清单恢复信任；返回 true 表示快照存在（否则调用方走迁移回退） */
export async function restoreTrustFromDisk(): Promise<boolean> {
  try {
    const raw = await readFile(trustFile(), 'utf-8')
    const snapshot = JSON.parse(raw) as TrustSnapshot
    if (!snapshot || typeof snapshot !== 'object') return false
    const lists: { items: unknown; apply: (item: string) => void | Promise<void> }[] = [
      { items: snapshot.workspaces, apply: (w) => {
        trustDirectory(w, { essential: true })
        const pinned = snapshot.pinnedRoots?.[w]
        if (typeof pinned === 'string') restorePinnedTrustRoot(w, pinned)
      } },
      { items: snapshot.files, apply: trustFileForSave },
      { items: snapshot.imageDirs, apply: (dir) => {
        allowImageDirectory(dir)
        const pinned = snapshot.pinnedImageDirs?.[dir]
        if (typeof pinned === 'string') restorePinnedImageDir(dir, pinned)
      } },
    ]
    for (const { items, apply } of lists) {
      if (!Array.isArray(items)) continue
      for (let i = 0; i < items.length; i++) {
        if (typeof items[i] === 'string' && items[i]) await apply(items[i])
      }
    }
    return true
  } catch {
    return false
  }
}

const collectStoredPins = (
  paths: string[],
  currentOf: (path: string) => string | null,
  previous: unknown,
): Record<string, string> => {
  const stored = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? previous as Record<string, unknown>
    : null
  const pins: Record<string, string> = {}
  for (const path of paths) {
    const current = currentOf(path)
    const earlier = stored && typeof stored[path] === 'string' ? stored[path] : null
    const pinned = current ?? earlier
    if (pinned) pins[path] = pinned
  }
  return pins
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

/** 授信变更后调用：防抖写盘，合并高频操作（保存图片 / 打开文件等） */
export function schedulePersistTrust(immediate = false): void {
  if (immediate) {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    void persistTrustSnapshot()
    return
  }
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    void persistTrustSnapshot()
  }, 1000)
}

async function persistTrustSnapshot(): Promise<void> {
  try {
    // 应用自有图片目录每次启动都会重新授信，无需持久化
    const appImagesDir = join(app.getPath('userData'), 'images')
    const mineWorkspaces = getEssentialRoots().filter((root) => root !== appImagesDir)
    const mineFiles = getTrustedFiles()
    const mineImageDirs = getImageReadDirs()
    const file = trustFile()
    await mkdir(app.getPath('userData'), { recursive: true })
    // F-L1：多窗口模式存在多个独立主进程，各自整体覆写会互相覆盖，
    // 其他窗口登记过的信任在重启后丢失。写前合并磁盘上既有快照
    let existing: Partial<TrustSnapshot> | null = null
    try {
      existing = JSON.parse(await readFile(file, 'utf-8')) as Partial<TrustSnapshot>
      if (!existing || typeof existing !== 'object') existing = null
    } catch {
      existing = null
    }
    const union = (mine: string[], theirs: string[] | undefined): string[] => {
      const seen = new Set<string>()
      const out: string[] = []
      for (const item of [...(theirs ?? []), ...mine]) {
        if (typeof item === 'string' && item && !seen.has(item)) {
          seen.add(item)
          out.push(item)
        }
      }
      return out
    }
    const snapshot: TrustSnapshot = {
      workspaces: union(mineWorkspaces, existing?.workspaces).slice(-MAX_PERSISTED_WORKSPACES),
      files: union(mineFiles, existing?.files).slice(-MAX_PERSISTED_FILES),
      imageDirs: union(mineImageDirs, existing?.imageDirs).slice(-MAX_PERSISTED_IMAGE_DIRS),
    }
    const pinnedRoots = collectStoredPins(snapshot.workspaces, getPinnedTrustRoot, existing?.pinnedRoots)
    const pinnedImageDirs = collectStoredPins(snapshot.imageDirs, getPinnedImageDir, existing?.pinnedImageDirs)
    if (Object.keys(pinnedRoots).length > 0) snapshot.pinnedRoots = pinnedRoots
    if (Object.keys(pinnedImageDirs).length > 0) snapshot.pinnedImageDirs = pinnedImageDirs
    const tmp = `${file}.${process.pid}-${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(snapshot), 'utf-8')
    await rename(tmp, file)
  } catch {
    /* 持久化失败不影响本次会话的信任状态 */
  }
}
