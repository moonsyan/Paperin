import type { WorkspaceIndex } from '../../../../shared/workspace-index'
import type { BacklinkGraph } from '../../lib/backlinks'

export interface GraphFilter {
  directory?: string
  tag?: string
  depth?: number
  activePath?: string | null
  search?: string
}

export interface GraphDataNode {
  id: string
  path: string | null
  label: string
  folder: string
  ghost: boolean
  degree: number
}

export interface GraphDataLink {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphDataNode[]
  links: GraphDataLink[]
  reduced: boolean
}

/** 默认节点上限与可设置范围（设置项可在图谱设置面板调整） */
export const GRAPH_NODE_LIMIT = 1200
export const MIN_GRAPH_NODE_LIMIT = 100
export const MAX_GRAPH_NODE_LIMIT = 10000
/** 边数基础上限；节点上限更高时按节点数放大，避免大图边被过度裁剪 */
const BASE_GRAPH_EDGES = 2000

const clampNodeLimit = (value: number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return GRAPH_NODE_LIMIT
  return Math.min(MAX_GRAPH_NODE_LIMIT, Math.max(MIN_GRAPH_NODE_LIMIT, Math.round(value)))
}

export interface GraphDataOptions {
  /** 节点规模上限（100–10000，缺省 1200） */
  maxNodes?: number
  /** 隐藏孤立节点（degree 为 0 的文件）：大工作区里无链接笔记会铺满
   *  画布、淹没真正有链接关系的核心结构；ghost 节点必有度数，不受影响 */
  hideOrphans?: boolean
}

const normalize = (value: string): string => value.replace(/\\/g, '/').toLowerCase()
const topFolder = (relativePath: string): string => {
  const normalized = relativePath.replace(/\\/g, '/')
  const index = normalized.indexOf('/')
  return index > 0 ? normalized.slice(0, index) : ''
}

const capEdges = (links: GraphDataLink[], nodes: Map<string, GraphDataNode>, maxEdges: number): GraphDataLink[] => {
  if (links.length <= maxEdges) return links
  return links
    .slice()
    .sort((a, b) =>
      (nodes.get(b.source)?.degree ?? 0) + (nodes.get(b.target)?.degree ?? 0) -
      (nodes.get(a.source)?.degree ?? 0) - (nodes.get(a.target)?.degree ?? 0),
    )
    .slice(0, maxEdges)
}

const fromWorkspaceIndex = (index: WorkspaceIndex): { nodes: GraphDataNode[]; links: GraphDataLink[] } => {
  const nodes = new Map<string, GraphDataNode>()
  for (const document of Object.values(index.documents)) {
    nodes.set(document.path, {
      id: document.path,
      path: document.path,
      label: document.name,
      folder: topFolder(document.relativePath),
      ghost: false,
      degree: 0,
    })
  }
  const links: GraphDataLink[] = []
  const seen = new Set<string>()
  for (const link of index.links) {
    const target = link.resolvedPath ?? `ghost:${link.target.trim().toLowerCase()}`
    if (!link.resolvedPath && !nodes.has(target)) {
      nodes.set(target, { id: target, path: null, label: link.target.trim(), folder: '', ghost: true, degree: 0 })
    }
    if (!nodes.has(link.sourcePath)) continue
    const key = `${normalize(link.sourcePath)}\u0000${normalize(target)}`
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ source: link.sourcePath, target })
  }
  for (const link of links) {
    const source = nodes.get(link.source)
    const target = nodes.get(link.target)
    if (source) source.degree++
    if (target) target.degree++
  }
  return { nodes: Array.from(nodes.values()), links }
}

const fromBacklinkGraph = (graph: BacklinkGraph): { nodes: GraphDataNode[]; links: GraphDataLink[] } => {
  const nodes = new Map<string, GraphDataNode>()
  for (const node of graph.nodes) {
    nodes.set(node.path, { id: node.path, path: node.path, label: node.name, folder: topFolder(node.relPath), ghost: false, degree: 0 })
  }
  const links: GraphDataLink[] = []
  const seen = new Set<string>()
  for (const edge of graph.edges) {
    const target = edge.targetPath ?? `ghost:${edge.target.trim().toLowerCase()}`
    if (!edge.targetPath && !nodes.has(target)) nodes.set(target, { id: target, path: null, label: edge.target, folder: '', ghost: true, degree: 0 })
    const key = `${normalize(edge.sourcePath)}\u0000${normalize(target)}`
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ source: edge.sourcePath, target })
  }
  for (const link of links) {
    const source = nodes.get(link.source)
    const target = nodes.get(link.target)
    if (source) source.degree++
    if (target) target.degree++
  }
  return { nodes: Array.from(nodes.values()), links }
}

export const buildGraphData = (
  source: WorkspaceIndex | BacklinkGraph,
  filter: GraphFilter = {},
  options: GraphDataOptions = {},
): GraphData => {
  const maxNodes = clampNodeLimit(options.maxNodes)
  const maxEdges = Math.max(BASE_GRAPH_EDGES, maxNodes * 4)
  const raw = 'documents' in source ? fromWorkspaceIndex(source) : fromBacklinkGraph(source)
  // 孤立节点在度数统计后、其余筛选前剔除：它们没有边，剔除不影响
  // 任何链接的完整性，只让画布留给有链接关系的结构
  if (options.hideOrphans) {
    raw.nodes = raw.nodes.filter((node) => node.ghost || node.degree > 0)
  }
  const directory = filter.directory?.replace(/[\\/]$/, '').toLowerCase()
  const tag = filter.tag?.toLowerCase()
  const matches = new Set<string>()
  for (const node of raw.nodes) {
    if (!node.path) continue
    const document = 'documents' in source ? source.documents[node.path] : undefined
    if (directory && !(document?.relativePath.toLowerCase().replace(/\\/g, '/').startsWith(directory + '/') || document?.relativePath.toLowerCase() === directory)) continue
    if (tag && !(document?.tags.some((item) => item.toLowerCase() === tag))) continue
    if (filter.search && !`${node.label} ${node.id} ${node.folder}`.toLowerCase().includes(filter.search.toLowerCase())) continue
    matches.add(node.id)
  }
  if (!directory && !tag && !filter.search) raw.nodes.forEach((node) => matches.add(node.id))

  let nodes = raw.nodes.filter((node) => matches.has(node.id))
  let links = raw.links.filter((link) => matches.has(link.source) && matches.has(link.target))
  if (filter.depth !== undefined && filter.activePath) {
    const depth = Math.max(0, filter.depth)
    const adjacency = new Map<string, Set<string>>()
    for (const link of raw.links) {
      const setA = adjacency.get(link.source) ?? new Set<string>()
      const setB = adjacency.get(link.target) ?? new Set<string>()
      setA.add(link.target); setB.add(link.source)
      adjacency.set(link.source, setA); adjacency.set(link.target, setB)
    }
    const allowed = new Set<string>([filter.activePath])
    let frontier = [filter.activePath]
    for (let level = 0; level < depth; level++) {
      const next: string[] = []
      for (const id of frontier) {
        const neighbours = adjacency.get(id)
        if (!neighbours) continue
        for (const adjacent of Array.from(neighbours)) {
          if (allowed.has(adjacent)) continue
          allowed.add(adjacent)
          next.push(adjacent)
        }
      }
      frontier = next
    }
    nodes = nodes.filter((node) => allowed.has(node.id))
    links = links.filter((link) => allowed.has(link.source) && allowed.has(link.target))
  }
  let reduced = false
  if (nodes.length > maxNodes) {
    const active = normalize(filter.activePath ?? '')
    nodes = nodes.slice().sort((a, b) => {
      const activeDelta = Number(normalize(b.path ?? b.id) === active) - Number(normalize(a.path ?? a.id) === active)
      return activeDelta || b.degree - a.degree || a.id.localeCompare(b.id)
    }).slice(0, maxNodes)
    const kept = new Set(nodes.map((node) => normalize(node.id)))
    links = links.filter((link) => kept.has(normalize(link.source)) && kept.has(normalize(link.target)))
    reduced = true
  }
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  return { nodes, links: capEdges(links, nodeMap, maxEdges), reduced }
}
