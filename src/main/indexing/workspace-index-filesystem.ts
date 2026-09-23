import { readdir, stat } from 'fs/promises'
import { resolve } from 'path'
import { isTraversableWorkspaceDirectory, readTextAutoEncoding } from '../ipc/file-io'
import type { WorkspaceFileMeta, WorkspaceIndexServiceDeps } from './workspace-index-service'
import {
  dirnameWorkspacePath,
  isAbsoluteWorkspacePath,
  relativeWorkspacePath,
  resolveWorkspacePath,
} from './workspace-path'

type WorkspaceIndexFilesystemDependencies = Pick<
  WorkspaceIndexServiceDeps,
  'listMarkdownFiles' | 'readFileText' | 'resolveResourcePath'
>

/**
 * 生产索引使用的真实文件系统适配器。
 *
 * 它与工作区 UI 文件树的节点预算解耦；索引服务把自身预算作为 limit 传入，
 * 适配器最多多返回一个文件，让服务能够准确标记 truncated。
 */
export const createWorkspaceIndexFilesystemDependencies = (): WorkspaceIndexFilesystemDependencies => ({
  async listMarkdownFiles(root, limit) {
    const files: WorkspaceFileMeta[] = []
    const walk = async (directory: string): Promise<void> => {
      if (limit !== undefined && files.length >= limit) return
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
      entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
      for (const entry of entries) {
        if (limit !== undefined && files.length >= limit) return
        const path = resolve(directory, entry.name)
        if (await isTraversableWorkspaceDirectory(directory, entry)) {
          await walk(path)
          continue
        }
        if (entry.isSymbolicLink() || !entry.isFile() || !/\.(?:md|markdown)$/i.test(entry.name)) continue
        const fileStat = await stat(path).catch(() => null)
        if (!fileStat?.isFile()) continue
        files.push({ path, size: fileStat.size, mtimeMs: fileStat.mtimeMs })
      }
    }
    await walk(resolve(root))
    return files
  },

  async readFileText(path) {
    return (await readTextAutoEncoding(path)).content
  },

  async resolveResourcePath(root, target, sourcePath) {
    if (/^(?:[a-z]+:|\\\\)/i.test(target)) return null
    const resolvedRoot = resolveWorkspacePath(root)
    const candidate = resolveWorkspacePath(
      sourcePath ? dirnameWorkspacePath(sourcePath) : resolvedRoot,
      target,
    )
    const fromRoot = relativeWorkspacePath(resolvedRoot, candidate)
    if (
      fromRoot === '..'
      || fromRoot.startsWith('..\\')
      || fromRoot.startsWith('../')
      || isAbsoluteWorkspacePath(fromRoot)
    ) {
      return null
    }
    const resourceStat = await stat(candidate).catch(() => null)
    return resourceStat?.isFile() ? candidate : null
  },
})
