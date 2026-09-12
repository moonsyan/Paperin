/**
 * 文档路径展示的共享纯函数。
 *
 * CurrentFileBanner（顶栏右区紧凑标识）与 DocumentPathbar（正文上方轻路径条）
 * 共用同一套「工作区相对路径 / 外部文件全路径」口径，避免两处显示不一致。
 * 同时提供「定位当前文件」所需的祖先目录 key 计算（供侧栏展开祖先链）。
 */

export type PathDisplaySource = 'workspace' | 'external'

const normalizePath = (value: string): string =>
  value.replace(/\\/g, '/').replace(/\/+/g, '/')

/**
 * 展示用路径：库内文件显示相对路径；外部文件与无工作区时显示规范化全路径。
 * 行为与原 CurrentFileBanner 的 displayPath 完全一致（迁移自该组件）。
 */
export const displayPath = (
  path: string | null | undefined,
  workspacePath: string | null | undefined,
  source: PathDisplaySource,
): string => {
  if (!path) return source === 'external' ? '外部文件' : '未保存文档'
  const normalizedPath = normalizePath(path)
  if (source !== 'workspace' || !workspacePath) return normalizedPath
  const root = normalizePath(workspacePath).replace(/\/$/, '')
  const comparablePath = normalizedPath.toLocaleLowerCase()
  const comparableRoot = root.toLocaleLowerCase()
  if (comparablePath === comparableRoot) return normalizedPath.split('/').pop() ?? normalizedPath
  if (comparablePath.startsWith(`${comparableRoot}/`)) return normalizedPath.slice(root.length + 1)
  return normalizedPath
}

/**
 * 文件相对工作区根的目录段（不含文件名）。
 * 文件不在工作区内（外部）或缺工作区路径时返回 null。
 * 例：('D:/notes/learn/method/note.md', 'D:/notes') → ['learn', 'method']
 */
export const relativeDirectorySegments = (
  path: string,
  workspacePath: string,
): string[] | null => {
  const normalizedFile = normalizePath(path)
  const root = normalizePath(workspacePath).replace(/\/$/, '')
  const comparableFile = normalizedFile.toLocaleLowerCase()
  const comparableRoot = root.toLocaleLowerCase()
  if (comparableFile === comparableRoot || !comparableFile.startsWith(`${comparableRoot}/`)) {
    return null
  }
  const relative = normalizedFile.slice(root.length + 1)
  const segments = relative.split('/')
  segments.pop() // 去掉文件名
  return segments
}

/**
 * 文件的祖先目录 key 链（绝对路径逐级累积，含工作区根本身，不含文件名）。
 * 与 Sidebar 文件树的 folder key（= 目录绝对路径）对齐；
 * 文件不在工作区内时返回空数组。
 * 例：('D:/notes/a/b/c.md', 'D:/notes') → ['D:/notes', 'D:/notes/a', 'D:/notes/a/b']
 */
export const ancestorFolderKeysForFile = (
  path: string,
  workspacePath: string,
): string[] => {
  const segments = relativeDirectorySegments(path, workspacePath)
  if (segments === null) return []
  const root = normalizePath(workspacePath).replace(/\/$/, '')
  const keys: string[] = [root]
  let current = root
  for (const segment of segments) {
    current = `${current}/${segment}`
    keys.push(current)
  }
  return keys
}

/**
 * 「定位当前文件」的折叠记录：从折叠记录中移除该文件的所有祖先目录，
 * 其余 key 原样保留（不重置用户折叠的其他分支）。
 * 目录 key 与树节点路径同源，通常无需大小写转换；caseInsensitive 用于
 * Windows 上树 key 与传入路径大小写不一致的兜底。
 */
export const collapsedKeysAfterReveal = (
  collapsedKeys: readonly string[],
  path: string,
  workspacePath: string,
  caseInsensitive: boolean,
): string[] => {
  const ancestorKeys = ancestorFolderKeysForFile(path, workspacePath)
  if (ancestorKeys.length === 0) return [...collapsedKeys]
  const ancestors = caseInsensitive
    ? new Set(ancestorKeys.map((key) => key.toLocaleLowerCase()))
    : new Set(ancestorKeys)
  const normalize = caseInsensitive ? (key: string) => key.toLocaleLowerCase() : (key: string) => key
  return collapsedKeys.filter((key) => !ancestors.has(normalize(key)))
}

/**
 * 带折叠记录缺省语义的定位：记录为 null（当前树无记录）时，
 * 实际折叠状态由「默认打开文件夹全部折叠」开关决定——
 * 开关开 = 全部折叠（此时基于全量 folder keys 推导），开关关 = 全部展开。
 */
export const collapsedKeysAfterRevealFromRecord = (
  record: readonly string[] | null,
  allFolderKeys: readonly string[],
  collapseAllOnOpen: boolean,
  path: string,
  workspacePath: string,
  caseInsensitive: boolean,
): string[] => {
  const base = record ?? (collapseAllOnOpen ? [...allFolderKeys] : [])
  return collapsedKeysAfterReveal(base, path, workspacePath, caseInsensitive)
}
