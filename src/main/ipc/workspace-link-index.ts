import { ipcMain } from 'electron'
import { stat } from 'fs/promises'
import { CHANNELS } from '../../shared/ipc/channels'
import type {
  WorkspaceLinkIndex,
  WorkspaceLinkIndexEntry,
  WorkspaceLinkRef,
} from '../../shared/link-index'
import { readTextAutoEncoding, walkMarkdownTree } from './file-io'
import type { FolderTreeNode } from './file-io'
import { withinCallerWorkspace } from './workspace-scope'
import {
  collectAttachmentBaseNames,
  extractLinksFromMarkdown,
} from '../indexing/markdown-links'

// 提取实现已抽至 indexing/markdown-links（统一索引解析器共用）；re-export
// 保持既有测试与调用方的 import 路径兼容
export { collectAttachmentBaseNames, extractLinksFromMarkdown }

/* ==================== 工作区链接索引（反链/图谱数据源） ==================== */

// 与全文搜索同量级的规模守卫：目录树深度/节点预算沿用 walkMarkdownTree
// 自带限制；文件数与单文件大小上限对齐搜索（500/2MB 放宽一档，
// 索引是后台一次性扫描且有 mtime 缓存，不与逐键交互争抢；
// 2000 覆盖常见大型 Obsidian 库）
const MAX_INDEX_FILES = 2000
const MAX_INDEX_FILE_SIZE = 2 * 1024 * 1024
const MAX_LINKS_TOTAL = 20_000
const MAX_INDEX_CACHE = 2000

/** 按文件缓存提取结果（mtime+size 校验），重扫时只读变更文件 */
const linkCache = new Map<string, { mtimeMs: number; size: number; links: WorkspaceLinkRef[] }>()

const cacheLinkResult = (
  path: string,
  entry: { mtimeMs: number; size: number; links: WorkspaceLinkRef[] },
): void => {
  if (linkCache.has(path)) {
    linkCache.set(path, entry)
    return
  }
  if (linkCache.size >= MAX_INDEX_CACHE) {
    const oldest = linkCache.keys().next().value
    if (oldest !== undefined) linkCache.delete(oldest)
  }
  linkCache.set(path, entry)
}

export function forgetLinkIndexCache(path: string): void {
  linkCache.delete(path)
}

export interface WorkspaceLinkIndexDependencies {
  workspaceRootFor(webContentsId: number): string | null
  isTrustedPath(candidate: unknown): boolean
}

export const registerWorkspaceLinkIndexHandlers = ({
  workspaceRootFor,
  isTrustedPath,
}: WorkspaceLinkIndexDependencies): void => {
  ipcMain.handle(CHANNELS.WORKSPACE_INDEX_LINKS, async (event, args: { dir?: string }) => {
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

      const files: WorkspaceLinkIndexEntry[] = []
      // 先收集附件基名（一次 readdir 遍历），用于排除无扩展名的图片嵌入
      const attachmentBaseNames = await collectAttachmentBaseNames(dir)
      let linkTotal = 0
      let linksCapped = false
      for (const path of paths.slice(0, MAX_INDEX_FILES)) {
        const fileStat = await stat(path).catch(() => null)
        if (!fileStat || fileStat.size > MAX_INDEX_FILE_SIZE) continue
        const cached = linkCache.get(path)
        if (
          cached &&
          cached.mtimeMs === fileStat.mtimeMs &&
          cached.size === fileStat.size
        ) {
          files.push({ path, mtimeMs: fileStat.mtimeMs, size: fileStat.size, links: cached.links })
          linkTotal += cached.links.length
          continue
        }
        // 链接总数超限后不再读文件提取（省 IO），但文件本身仍入索引——
        // 否则大库后段文件在图谱里整个消失
        if (linksCapped) {
          files.push({ path, mtimeMs: fileStat.mtimeMs, size: fileStat.size, links: [] })
          continue
        }
        let links: WorkspaceLinkRef[] = []
        try {
          const { content } = await readTextAutoEncoding(path)
          links = extractLinksFromMarkdown(content, attachmentBaseNames)
        } catch {
          // 单文件读取失败（编码异常等）跳过，不中断整个索引
          continue
        }
        cacheLinkResult(path, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, links })
        files.push({ path, mtimeMs: fileStat.mtimeMs, size: fileStat.size, links })
        linkTotal += links.length
        if (linkTotal >= MAX_LINKS_TOTAL) {
          linksCapped = true
        }
      }

      const truncated =
        treeBudget.truncated || paths.length > MAX_INDEX_FILES || linksCapped
      const index: WorkspaceLinkIndex = { files, truncated }
      return { ok: true, data: index }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })
}
