import type { IpcMainInvokeEvent } from 'electron'
import { realpath } from 'fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'path'
import { getPinnedTrustRoot, isPathTrustedAfterResolvingLinks } from '../trusted-paths'

/**
 * 工作区 IPC 的窗口级授权（多窗口绑定）。
 *
 * 全局信任根只证明"某个窗口曾打开过该目录"；多窗口模式下，工作区类操作
 * （新建/重命名/移动/删除/搜索/索引）必须校验目标路径属于发起调用的
 * 窗口当前打开的工作区根，防止 A 窗口操作 B 窗口的工作区。
 */

/** 大小写等价的路径包含判定（win32 不区分大小写；分隔符统一为平台分隔符） */
export const isInsideRoot = (root: string, candidate: string): boolean => {
  const normalize = (value: string) => {
    const normalized = resolve(value).replace(/[\\/]+/g, sep)
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
  }
  const rel = relative(normalize(root), normalize(candidate))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export interface WorkspaceScopeDependencies {
  workspaceRootFor(webContentsId: number): string | null
  isTrustedPath(candidate: unknown): boolean
}

/** 沿候选路径向上找到最近存在的父目录，用其真实路径拼回不存在的后缀。
 *  新建文件、短路径别名和尚未落盘的子目录都必须和钉住的真实根比较；
 *  整条链都不存在时返回 null，不得把失败的 realpath 当成授权。 */
const resolveCandidateForComparison = async (candidate: string): Promise<string | null> => {
  let current = resolve(candidate)
  const suffix: string[] = []
  while (true) {
    const realCurrent = await realpath(current).catch(() => null)
    if (realCurrent) return resolve(realCurrent, ...suffix)
    const parent = dirname(current)
    if (parent === current) return null
    suffix.unshift(basename(current))
    current = parent
  }
}

/** 目标路径是否属于调用窗口当前工作区根。
 *  存在的路径先经 realpath 消解符号链接与大小写差异再比较，
 *  防止工作区内的链接把操作引到根外；候选不存在时规范化最近存在父目录后再比较。 */
export const withinCallerWorkspace = async (
  deps: WorkspaceScopeDependencies,
  event: IpcMainInvokeEvent,
  candidate: string,
): Promise<boolean> => {
  const root = deps.workspaceRootFor(event.sender.id)
  if (!root || !deps.isTrustedPath(root)) return false
  // 信任根钉住首次真实路径。junction 换靶后 isPathTrusted 仍为真，这里必须拒绝。
  if (!(await isPathTrustedAfterResolvingLinks(root))) return false
  const pinnedRoot = getPinnedTrustRoot(root)
  if (!pinnedRoot) return false
  const realCandidate = await resolveCandidateForComparison(candidate)
  if (!realCandidate) return false
  return isInsideRoot(pinnedRoot, realCandidate)
}
