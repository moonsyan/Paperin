import { realpath } from 'fs/promises'
import { resolve } from 'path'

const MAX_EXPORT_DIRS = 32
const exportDirectories = new Map<string, string>()

export const resetExportDirectoriesForTests = (): void => {
  exportDirectories.clear()
}

/** 原生对话框刚选定的导出目录：只授权这次资源包写出，不升级为工作区写权限。 */
export const allowExportDirectory = async (directory: string): Promise<boolean> => {
  if (!directory) return false
  const selectedPath = resolve(directory)
  const realDirectory = await realpath(selectedPath).catch(() => null)
  if (!realDirectory) return false
  if (exportDirectories.size >= MAX_EXPORT_DIRS && !exportDirectories.has(selectedPath)) {
    const oldest = exportDirectories.keys().next().value
    if (oldest !== undefined) exportDirectories.delete(oldest)
  }
  exportDirectories.set(selectedPath, realDirectory)
  return true
}

export const isExportDirectoryAuthorized = async (directory: string): Promise<boolean> => {
  const selectedPath = resolve(directory)
  const pinned = exportDirectories.get(selectedPath)
  if (!pinned) return false
  const live = await realpath(selectedPath).catch(() => null)
  return live === pinned
}
