import { isAbsolute, relative, resolve } from 'path'

/**
 * 信任根集合：mdimg 协议与文件 IPC 共用的授权目录（L2/L8）。
 * - 容量上限 + 最早淘汰：防止"打开过的目录永久累积"导致无界增长
 * - 子路径自动覆盖（相对路径判定），无需逐个登记 attachments 等子目录
 * - 渲染进程无法直接调用本模块，授权只发生在主进程校验后的流程中
 */

const trustedRoots = new Map<string, true>()

/** 可淘汰信任根数量上限：超出时淘汰最早加入的（Map 保持插入顺序）。
 *  信任相关运行时/持久化上限的单一来源之一，session-trust 从此处引用派生。 */
export const MAX_TRUSTED_ROOTS = 64
/** 保底信任根（工作区、应用图片目录）：永不被容量淘汰，但见 protectedRoots */
const essentialRoots = new Set<string>()
/** 保底且不可淘汰的根（应用自有目录）：即使满员也是最后的淘汰候选 */
const protectedRoots = new Set<string>()

export interface TrustDirectoryOptions {
  /**
   * 保底根：不随"打开过 64+ 个其它目录"被普通淘汰逻辑淘汰。
   * 用于工作区与应用自有目录——否则工作区内的保存/搜索会开始返回
   * INVALID_PATH（B-M1）。容量打满时最旧的可淘汰保底根仍会被淘汰
   * （工作区可在用户重开时自愈，见 evictable）。
   */
  essential?: boolean
  /**
   * 是否参与"满员淘汰"（默认 true）。工作区设 true：每个窗口同时只
   * 使用一个工作区（workspaceRootsByWebContents 单值），被淘汰的最旧
   * 工作区根必然不是当前使用中的，且用户重开时自动重新登记。
   * 应用自有目录（userData/images）设 false（protected）：它不是用户
   * 可重开的会话对象，淘汰后图片管理面板会短暂失去信任根。
   */
  evictable?: boolean
}

/** 容量打满时淘汰一个根：优先最早的非保底根，其次最早的可淘汰保底根。
 *  全部为不可淘汰保底根时返回 false（调用方停止登记，避免无界增长）。 */
const evictOldest = (): boolean => {
  const roots = Array.from(trustedRoots.keys())
  for (let i = 0; i < roots.length; i++) {
    if (!essentialRoots.has(roots[i])) {
      trustedRoots.delete(roots[i])
      return true
    }
  }
  for (let i = 0; i < roots.length; i++) {
    if (!protectedRoots.has(roots[i])) {
      trustedRoots.delete(roots[i])
      essentialRoots.delete(roots[i])
      return true
    }
  }
  return false
}

export function trustDirectory(
  directory: string,
  options?: TrustDirectoryOptions,
): void {
  if (!directory) return
  const dir = resolve(directory)
  const essential = options?.essential === true
  const evictable = options?.evictable !== false
  if (trustedRoots.has(dir)) {
    // 已按普通根登记过的目录，用户打开为工作区时升级为保底根
    if (essential) {
      essentialRoots.add(dir)
      if (!evictable) protectedRoots.add(dir)
    }
    return
  }
  if (trustedRoots.size >= MAX_TRUSTED_ROOTS) {
    // 满员：先淘汰（首选非保底根，其次最旧可淘汰保底根）。
    // 此前若全部为保底根会直接 return——新工作区/对话框打开的目录静默
    // 登记失败，后续保存/搜索/删除全部 INVALID_PATH 且无任何提示。
    evictOldest()
    if (trustedRoots.size >= MAX_TRUSTED_ROOTS) return
  }
  trustedRoots.set(dir, true)
  if (essential) {
    essentialRoots.add(dir)
    if (!evictable) protectedRoots.add(dir)
  }
}

/**
 * 工作区切换等"正在使用"时调用：把根移到 Map 末尾（MRU）。
 * 满员淘汰按插入顺序淘汰最旧根——多窗口模式下各窗口的当前工作区
 * 都要保鲜，否则 64 满员后的淘汰可能命中其它窗口正在使用的工作区。
 * 仅调整淘汰顺序，不影响 essential/protected 标记与信任判定。
 */
export function touchTrustedRoot(path: string): void {
  const dir = resolve(path)
  if (!trustedRoots.has(dir)) return
  trustedRoots.delete(dir)
  trustedRoots.set(dir, true)
}

/** 路径是否位于任一信任根内（含根自身与所有子路径） */
export function isPathTrusted(filePath: string): boolean {  const resolved = resolve(filePath)
  const roots = Array.from(trustedRoots.keys())
  for (let i = 0; i < roots.length; i++) {
    const pathFromRoot = relative(roots[i], resolved)
    if (
      pathFromRoot === '' ||
      (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
    ) {
      return true
    }
  }
  return false
}

export function getTrustedRoots(): string[] {
  return Array.from(trustedRoots.keys())
}

/** 保底信任根（工作区、应用自有目录）：供持久化快照区分可恢复的工作区 */
export function getEssentialRoots(): string[] {
  return Array.from(essentialRoots)
}

/**
 * 文件级保存白名单（H1 修复）：FILE_READ 读过的 .md 精确路径。
 * FILE_SAVE 允许写回这些文件，但不再向其所在目录授予任何其它权限。
 */
const trustedFiles = new Map<string, true>()

/** 文件级白名单数量上限：超出时淘汰最早加入的。
 *  持久化 files 清单上限（session-trust）与运行时共用此值，修改即同步生效。 */
export const MAX_TRUSTED_FILES = 128

export function trustFileForSave(filePath: string): void {
  if (!filePath) return
  const p = resolve(filePath)
  if (trustedFiles.has(p)) return
  if (trustedFiles.size >= MAX_TRUSTED_FILES) {
    const oldest = trustedFiles.keys().next().value
    if (oldest !== undefined) trustedFiles.delete(oldest)
  }
  trustedFiles.set(p, true)
}

/** 该精确文件是否可写回（仅 FILE_SAVE 使用；目录其它操作仍需完整信任根） */
export function isFileTrustedForSave(filePath: string): boolean {
  if (!filePath) return false
  return trustedFiles.has(resolve(filePath))
}

/** 文件级保存白名单全量（供跨启动信任持久化） */
export function getTrustedFiles(): string[] {
  return Array.from(trustedFiles.keys())
}
