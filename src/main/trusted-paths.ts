import { realpath } from 'fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'path'

/**
 * 信任根集合：mdimg 协议与文件 IPC 共用的授权目录（L2/L8）。
 * - 容量上限 + 最早淘汰：防止"打开过的目录永久累积"导致无界增长
 * - 子路径自动覆盖（相对路径判定），无需逐个登记 attachments 等子目录
 * - 渲染进程无法直接调用本模块，授权只发生在主进程校验后的流程中
 */

const trustedRoots = new Map<string, { pinnedReal: string | null }>()

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
  trustedRoots.set(dir, { pinnedReal: null })
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
  const entry = trustedRoots.get(dir)
  if (!entry) return
  trustedRoots.delete(dir)
  trustedRoots.set(dir, entry)
}

/** 路径是否位于任一信任根内（含根自身与所有子路径） */
const isPathInsideRoot = (root: string, filePath: string): boolean => {
  const pathFromRoot = relative(root, filePath)
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))
}

export function isPathTrusted(filePath: string): boolean {
  const resolved = resolve(filePath)
  const roots = Array.from(trustedRoots.keys())
  for (let i = 0; i < roots.length; i++) {
    if (isPathInsideRoot(roots[i], resolved)) return true
  }
  return false
}

/**
 * 词法路径位于已授权根内仍不足以授权访问：符号链接可能把读写引到根外。
 * 仅对存在目标返回 true；新建文件继续由调用方的目录授权和写入流程处理。
 */
export const isPathTrustedAfterResolvingLinks = async (filePath: string): Promise<boolean> => {
  if (!isPathTrusted(filePath)) return false
  return isResolvedPathWithinTrustedRoots(filePath)
}

/** 以真实路径比较目标与全部已授权根，供已解析的写入目标做二次校验。 */
export const isResolvedPathWithinTrustedRoots = async (filePath: string): Promise<boolean> => {
  const realFilePath = await realpath(filePath).catch(() => null)
  if (!realFilePath) return false
  const matches = await Promise.all(
    Array.from(trustedRoots.entries()).map(async ([root, entry]) => {
      const liveRoot = await realpath(root).catch(() => null)
      if (!liveRoot) return false
      // 首次解析钉住真实根；之后 junction 换靶不得扩大授权范围。
      if (entry.pinnedReal === null) entry.pinnedReal = liveRoot
      else if (liveRoot !== entry.pinnedReal) return false
      return isPathInsideRoot(entry.pinnedReal, realFilePath)
    }),
  )
  return matches.some(Boolean)
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
interface TrustedFile {
  realPath: string
}

/**
 * 文件级授权同时绑定用户选择时的真实目标。只按词法路径保存白名单时，攻击者
 * 可在授权后把该路径改为符号链接，令后续读写跟随至未授权文件。
 */
const trustedFiles = new Map<string, TrustedFile>()

/** 文件级白名单数量上限：超出时淘汰最早加入的。
 *  持久化 files 清单上限（session-trust）与运行时共用此值，修改即同步生效。 */
export const MAX_TRUSTED_FILES = 128

export async function trustFileForSave(filePath: string): Promise<void> {
  if (!filePath) return
  const p = resolve(filePath)
  const realPath = await realpath(p).catch(() => null)
  if (!realPath) return
  if (trustedFiles.has(p)) {
    trustedFiles.set(p, { realPath })
    return
  }
  if (trustedFiles.size >= MAX_TRUSTED_FILES) {
    const oldest = trustedFiles.keys().next().value
    if (oldest !== undefined) trustedFiles.delete(oldest)
  }
  trustedFiles.set(p, { realPath })
}

/** 该精确文件是否可写回（仅 FILE_SAVE 使用；目录其它操作仍需完整信任根） */
export async function isFileTrustedForSave(filePath: string): Promise<boolean> {
  if (!filePath) return false
  const trustedFile = trustedFiles.get(resolve(filePath))
  if (!trustedFile) return false
  const currentRealPath = await realpath(filePath).catch(() => null)
  return currentRealPath === trustedFile.realPath
}

/**
 * 工作区授权必须经 realpath 防止符号链接逃逸；精确文件白名单只代表用户对该
 * 单个路径的明确授权，绝不授予同目录的其它路径。
 */
export const isPathAuthorizedForReadOrSave = async (filePath: string): Promise<boolean> => {
  if (isPathTrusted(filePath)) return isPathTrustedAfterResolvingLinks(filePath)
  return await isFileTrustedForSave(filePath)
}

/**
 * 工作区写入必须在实际目标解析后重验根边界；精确文件授权只接受首次授权时
 * 的同一真实目标，不扩大为目录授权，也不允许链接换靶。
 */
export const getWriteTargetAuthorizer = (
  filePath: string,
): ((target: string) => Promise<boolean>) | undefined => {
  if (isPathTrusted(filePath)) return isResolvedPathWithinTrustedRoots
  const trustedFile = trustedFiles.get(resolve(filePath))
  if (!trustedFile) return undefined
  return async (target: string): Promise<boolean> => {
    const currentRealPath = await realpath(target).catch(() => null)
    return currentRealPath === trustedFile.realPath
  }
}

/**
 * 原生“另存为”只授权用户刚刚选定的目标。已存在文件固定其真实身份；新文件
 * 则固定其逻辑文件名和所选父目录的真实身份，避免对话框确认后被链接换靶。
 */
export const createSaveAsWriteTargetAuthorizer = async (
  filePath: string,
): Promise<((target: string) => Promise<boolean>) | null> => {
  const selectedPath = resolve(filePath)
  const selectedTarget = await realpath(selectedPath).catch(() => null)
  const selectedDirectory = await realpath(dirname(selectedPath)).catch(() => null)
  if (!selectedDirectory) return null
  return async (target: string): Promise<boolean> => {
    const realTarget = await realpath(target).catch(() => null)
    if (selectedTarget) return realTarget === selectedTarget
    if (realTarget || resolve(target) !== selectedPath) return false
    const realDirectory = await realpath(dirname(target)).catch(() => null)
    return realDirectory === selectedDirectory
  }
}

/**
 * 对话框选定目标后、真正写盘前再核对真实身份。打印 PDF 等耗时操作期间
 * 目标可能被换成链接，不能只用对话框返回的逻辑路径。
 */
export const writeIfDialogTargetStillAuthorized = async (
  filePath: string,
  write: (target: string) => Promise<void>,
  existingAuthorizer?: ((target: string) => Promise<boolean>) | null,
): Promise<'written' | 'invalid-path'> => {
  const isTargetAuthorized = existingAuthorizer ?? await createSaveAsWriteTargetAuthorizer(filePath)
  if (!isTargetAuthorized) return 'invalid-path'
  if (!await isTargetAuthorized(filePath)) return 'invalid-path'
  await write(filePath)
  return 'written'
}

/** 文件级保存白名单全量（供跨启动信任持久化） */
export function getTrustedFiles(): string[] {
  return Array.from(trustedFiles.keys())
}
