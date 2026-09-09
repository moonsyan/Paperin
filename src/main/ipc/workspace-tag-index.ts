import { ipcMain } from 'electron'
import { stat } from 'fs/promises'
import { CHANNELS } from '../../shared/ipc/channels'
import type { WorkspaceTagIndex, WorkspaceTagIndexEntry } from '../../shared/tag-index'
import { readTextAutoEncoding, walkMarkdownTree } from './file-io'
import type { FolderTreeNode } from './file-io'
import { withinCallerWorkspace } from './workspace-scope'
import { extractTagsFromFrontmatter } from '../indexing/frontmatter-tags'

// 提取实现已抽至 indexing/frontmatter-tags（统一索引解析器共用）；re-export
// 保持既有测试与调用方的 import 路径兼容
export { extractTagsFromFrontmatter }

/* ==================== 工作区标签索引（frontmatter tags 扫描） ==================== */

// 规模守卫与链接索引同量级：后台一次性扫描 + mtime 缓存，不与逐键交互争抢
const MAX_INDEX_FILES = 2000
const MAX_INDEX_FILE_SIZE = 2 * 1024 * 1024
const MAX_TAGS_TOTAL = 20_000
const MAX_INDEX_CACHE = 2000

/** 按文件缓存提取结果（mtime+size 校验），重扫时只读变更文件 */
const tagCache = new Map<string, { mtimeMs: number; size: number; tags: string[] }>()

const cacheTagResult = (
  path: string,
  entry: { mtimeMs: number; size: number; tags: string[] },
): void => {
  if (tagCache.has(path)) {
    tagCache.set(path, entry)
    return
  }
  if (tagCache.size >= MAX_INDEX_CACHE) {
    const oldest = tagCache.keys().next().value
    if (oldest !== undefined) tagCache.delete(oldest)
  }
  tagCache.set(path, entry)
}

export function forgetTagIndexCache(path: string): void {
  tagCache.delete(path)
}

export interface WorkspaceTagIndexDependencies {
  workspaceRootFor(webContentsId: number): string | null
  isTrustedPath(candidate: unknown): boolean
}

export const registerWorkspaceTagIndexHandlers = ({
  workspaceRootFor,
  isTrustedPath,
}: WorkspaceTagIndexDependencies): void => {
  ipcMain.handle(CHANNELS.WORKSPACE_INDEX_TAGS, async (event, args: { dir?: string }) => {
    try {
      // 窗口绑定：目录必须是发起调用窗口当前打开的工作区根（防跨窗口扫描）
      const dir = args && typeof args.dir === 'string' ? args.dir : ''
      if (
        !dir ||
        !(await withinCallerWorkspace({ workspaceRootFor, isTrustedPath }, event, dir))
      ) {
        return { ok: false, error: { code: 'INVALID_TARGET' } }
      }
      const dirStat = await stat(dir).catch(() => null)
      if (!dirStat) return { ok: false, error: { code: 'NOT_FOUND' } }
      if (!dirStat.isDirectory()) return { ok: false, error: { code: 'NOT_DIRECTORY' } }

      const treeBudget = { nodes: 0, truncated: false }
      const tree = await walkMarkdownTree(dir, 0, treeBudget)
      const paths: string[] = []
      const flatten = (nodes: FolderTreeNode[]) => {
        for (const node of nodes) {
          if (node.children) {
            flatten(node.children)
            continue
          }
          paths.push(node.path)
        }
      }
      flatten(tree)

      const files: WorkspaceTagIndexEntry[] = []
      let tagTotal = 0
      let tagsCapped = false
      for (const path of paths.slice(0, MAX_INDEX_FILES)) {
        const fileStat = await stat(path).catch(() => null)
        if (!fileStat || fileStat.size > MAX_INDEX_FILE_SIZE) continue
        const cached = tagCache.get(path)
        if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
          files.push({ path, mtimeMs: fileStat.mtimeMs, size: fileStat.size, tags: cached.tags })
          tagTotal += cached.tags.length
          continue
        }
        // 标签总数超限后不再读文件提取（省 IO），文件本身仍入索引保持覆盖口径一致
        if (tagsCapped) {
          files.push({ path, mtimeMs: fileStat.mtimeMs, size: fileStat.size, tags: [] })
          continue
        }
        let tags: string[] = []
        try {
          const { content } = await readTextAutoEncoding(path)
          tags = extractTagsFromFrontmatter(content)
        } catch {
          // 单文件读取失败（编码异常等）跳过，不中断整个索引
          continue
        }
        cacheTagResult(path, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, tags })
        files.push({ path, mtimeMs: fileStat.mtimeMs, size: fileStat.size, tags })
        tagTotal += tags.length
        if (tagTotal >= MAX_TAGS_TOTAL) tagsCapped = true
      }

      const truncated = treeBudget.truncated || paths.length > MAX_INDEX_FILES || tagsCapped
      const index: WorkspaceTagIndex = { files, truncated }
      return { ok: true, data: index }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })
}
