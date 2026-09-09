import type { FolderTreeNode } from '../../../../preload/api'
import type { DemoFolder } from '../../data/demo-files'

export interface UiNode {
  key: string
  name: string
  kind: 'folder' | 'file'
  demoId?: string
  path?: string
  children?: UiNode[]
}

export const buildDemoFileTree = (
  demoTree: DemoFolder[],
  demoFileNames: Record<string, string>,
): UiNode[] =>
  demoTree.map((folder) => ({
    key: `demo:${folder.label}`,
    name: folder.label,
    kind: 'folder',
    children: folder.fileIds.map((id) => ({
      key: id,
      name: demoFileNames[id] ?? id,
      kind: 'file',
      demoId: id,
    })),
  }))

const toUiNode = (node: FolderTreeNode): UiNode => ({
  key: node.path,
  name: node.name,
  kind: node.children ? 'folder' : 'file',
  path: node.path,
  children: node.children?.map(toUiNode),
})

export const buildWorkspaceFileTree = (
  workspacePath: string,
  tree: FolderTreeNode[],
  workspaceName?: string,
): UiNode[] => {
  const pathSegments = workspacePath.split(/[\\/]/).filter(Boolean)
  const name = workspaceName ?? pathSegments[pathSegments.length - 1] ?? workspacePath

  return [{
  key: workspacePath,
  name,
  kind: 'folder',
  path: workspacePath,
  children: tree.map(toUiNode),
  }]
}

export const collectFolderKeys = (nodes: UiNode[]): string[] => {
  const keys: string[] = []
  const visit = (items: UiNode[]) => {
    for (const node of items) {
      if (node.kind !== 'folder') continue
      keys.push(node.key)
      if (node.children) visit(node.children)
    }
  }
  visit(nodes)
  return keys
}

/** 按 key 在树中查找节点（深度优先），找不到返回 null */
export const findNodeByKey = (nodes: UiNode[], key: string): UiNode | null => {
  for (const node of nodes) {
    if (node.key === key) return node
    if (node.children) {
      const found = findNodeByKey(node.children, key)
      if (found) return found
    }
  }
  return null
}

/** 收集某节点自身及其所有后代文件夹的 key（含自身） */
export const collectFolderKeysUnder = (node: UiNode): string[] => {
  const keys: string[] = []
  const visit = (n: UiNode) => {
    if (n.kind !== 'folder') return
    keys.push(n.key)
    if (n.children) n.children.forEach(visit)
  }
  visit(node)
  return keys
}

/**
 * 按文件路径集合过滤树：只保留命中的文件与其祖先文件夹。
 * 路径比较大小写不敏感（win32 文件系统口径）；集合为空/null 时返回原树引用。
 * 返回新树（未命中分支被剪除），不修改入参。
 */
export const filterTreeByPaths = (
  nodes: UiNode[],
  allowedPaths: Set<string> | null,
): UiNode[] => {
  if (!allowedPaths || allowedPaths.size === 0) return nodes
  const lowerSet = new Set(Array.from(allowedPaths, (p) => p.toLowerCase()))
  const filterNodes = (items: UiNode[]): UiNode[] => {
    const out: UiNode[] = []
    for (const node of items) {
      if (node.kind === 'file') {
        if (node.path && lowerSet.has(node.path.toLowerCase())) out.push(node)
        continue
      }
      const children = node.children ? filterNodes(node.children) : []
      // 空文件夹（无命中后代）整枝剪除；根文件夹由调用方决定是否保留
      if (children.length > 0) out.push({ ...node, children })
    }
    return out
  }
  return filterNodes(nodes)
}
