import type { OpenFile } from '../Sidebar'

/**
 * 标签栏同名文件消歧（NEXT-UI-SPEC §3.2）。
 *
 * 不同目录的同名文件不能在标签栏里互相替换：当出现同名标签时，
 * 为每个有磁盘路径的标签计算「相对目录」消歧标记：
 * - 库内文件：相对工作区根的目录段（如 learn/method）
 * - 外部文件：父目录名
 * - 无路径（示例/未命名）：不生成标记
 * 唯一名称的标签不生成标记。
 */

const normalize = (value: string): string => value.replace(/\\/g, '/')

const directoryLabel = (path: string, workspacePath: string | null | undefined): string => {
  const normalizedPath = normalize(path)
  if (workspacePath) {
    const root = normalize(workspacePath).replace(/\/+$/, '')
    const comparableFile = normalizedPath.toLocaleLowerCase()
    const comparableRoot = root.toLocaleLowerCase()
    if (comparableFile.startsWith(`${comparableRoot}/`)) {
      const relative = normalizedPath.slice(root.length + 1)
      const segments = relative.split('/')
      segments.pop()
      return segments.join('/')
    }
  }
  const withoutFile = normalizedPath.replace(/\/[^/]+$/, '')
  const parent = withoutFile.split('/').pop() ?? ''
  return parent
}

export const tabSubdirLabels = (
  openFiles: readonly OpenFile[],
  workspacePath?: string | null,
): Record<string, string> => {
  const nameCounts = new Map<string, number>()
  for (const file of openFiles) {
    nameCounts.set(file.name, (nameCounts.get(file.name) ?? 0) + 1)
  }
  const labels: Record<string, string> = {}
  for (const file of openFiles) {
    if (!file.path) continue
    if ((nameCounts.get(file.name) ?? 0) < 2) continue
    const label = directoryLabel(file.path, workspacePath)
    if (label) labels[file.id] = label
  }
  return labels
}
