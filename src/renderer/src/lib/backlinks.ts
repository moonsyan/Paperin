import type { FolderTreeNode } from '../../../preload/api'
import type { WorkspaceLinkIndex } from '../../../shared/link-index'
import { createWikiIndexResolver } from './wiki-resolver'

/* ==================== 反向链接与知识图谱（纯数据层） ==================== */

export interface BacklinkEdge {
  /** 发出链接的文件（绝对路径） */
  sourcePath: string
  /** 解析后的目标文件（绝对路径）；未解析为 null */
  targetPath: string | null
  /** 原始目标文本（含锚点时保留原文） */
  target: string
  alias?: string
  line: number
  preview: string
  kind: 'wiki' | 'md'
}

export interface BacklinkNode {
  path: string
  name: string
  /** 相对工作区根的显示路径（含目录） */
  relPath: string
  /** 被引用次数（入度，仅已解析边） */
  inDegree: number
  /** 发出链接数（出度） */
  outDegree: number
}

export interface GhostNode {
  /** 未解析目标原文（大小写规范化去重键） */
  target: string
  /** 引用该目标的位置数 */
  refs: number
}

export interface BacklinkGraph {
  nodes: BacklinkNode[]
  edges: BacklinkEdge[]
  ghosts: GhostNode[]
}

const displayName = (path: string): string =>
  path.replace(/\\/g, '/').split('/').pop() ?? path

/** 相对路径显示（工作区内）；目录与根同名时仅显示文件名 */
const toRelDisplay = (path: string, workspacePath: string): string => {
  const normalized = path.replace(/\\/g, '/')
  const root = workspacePath.replace(/\\/g, '/').replace(/\/+$/, '')
  if (root && normalized.toLowerCase().startsWith(root.toLowerCase() + '/')) {
    return normalized.slice(root.length + 1)
  }
  return displayName(path)
}

/**
 * 把主进程链接索引解析为图谱数据：每条链接用 wiki-resolver 的口径解析目标，
 * 未解析的目标收敛为 ghost 节点（与 Obsidian 的"未创建笔记"对应）。
 * 解析结果带缓存（同一文件的全部链接共享同一 currentDir 上下文）。
 */
export function buildBacklinkGraph(
  index: WorkspaceLinkIndex,
  workspacePath: string,
  tree: FolderTreeNode[],
): BacklinkGraph {
  const edges: BacklinkEdge[] = []
  const byPath = new Map<string, BacklinkNode>()
  const ghostByKey = new Map<string, GhostNode>()
  // 索引化解析：逐条 resolveWikiTarget 会全树扫描，大库（1300+ 文件 ×
  // 上万链接）足以冻结渲染进程；预建哈希索引后每条 O(深度) 查找
  const resolver = createWikiIndexResolver(tree, workspacePath)
  // 同一（源文件, target）仍缓存一次，重复链接零开销
  const resolveCache = new Map<string, string | null>()

  for (const entry of index.files) {
    let node = byPath.get(entry.path)
    if (!node) {
      node = {
        path: entry.path,
        name: displayName(entry.path),
        relPath: toRelDisplay(entry.path, workspacePath),
        inDegree: 0,
        outDegree: 0,
      }
      byPath.set(entry.path, node)
    }

    for (const link of entry.links) {
      const cacheKey = `${entry.path}\u0000${link.target}`
      let targetPath = resolveCache.get(cacheKey)
      if (targetPath === undefined) {
        // md 链接目标即路径文本，与 wiki 链接走同一解析器（支持 ./ ../ 与绝对路径）
        const resolved = resolver.resolve(link.target, entry.path)
        targetPath = resolved.resolved ? resolved.path : null
        resolveCache.set(cacheKey, targetPath)
      }
      const edge: BacklinkEdge = {
        sourcePath: entry.path,
        targetPath,
        target: link.target,
        alias: link.alias,
        line: link.line,
        preview: link.preview,
        kind: link.kind,
      }
      edges.push(edge)
      node.outDegree++
      if (targetPath) {
        const target = byPath.get(targetPath)
        if (target) target.inDegree++
        else {
          byPath.set(targetPath, {
            path: targetPath,
            name: displayName(targetPath),
            relPath: toRelDisplay(targetPath, workspacePath),
            inDegree: 1,
            outDegree: 0,
          })
        }
      } else {
        const ghostKey = link.target.trim().toLowerCase()
        const ghost = ghostByKey.get(ghostKey)
        if (ghost) ghost.refs++
        else ghostByKey.set(ghostKey, { target: link.target.trim(), refs: 1 })
      }
    }
  }

  return {
    nodes: Array.from(byPath.values()),
    edges,
    ghosts: Array.from(ghostByKey.values()),
  }
}

/** 某文件的反向链接（谁引用了它），按来源路径排序保证稳定展示 */
export function getBacklinks(graph: BacklinkGraph | null, filePath: string | null): BacklinkEdge[] {
  if (!graph || !filePath) return []
  const lower = filePath.toLowerCase()
  return graph.edges
    .filter((e) => e.targetPath !== null && e.targetPath.toLowerCase() === lower)
    .sort((a, b) =>
      a.sourcePath === b.sourcePath ? a.line - b.line : a.sourcePath.localeCompare(b.sourcePath),
    )
}

/** 某文件的出链（它引用了谁），按行号排序 */
export function getOutgoingLinks(
  graph: BacklinkGraph | null,
  filePath: string | null,
): BacklinkEdge[] {
  if (!graph || !filePath) return []
  const lower = filePath.toLowerCase()
  return graph.edges
    .filter((e) => e.sourcePath.toLowerCase() === lower)
    .sort((a, b) => a.line - b.line)
}
