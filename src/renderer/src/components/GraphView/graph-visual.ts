import type { GraphData } from './graph-data'

export const baseNodeRadius = (degree: number): number =>
  5 + Math.min(10, Math.sqrt(degree) * 2.4)

const folderHueCache = new Map<string, number>()

/** Maps a folder name to a stable hue so layout refreshes do not change colors. */
export const folderHue = (folder: string): number => {
  let hue = folderHueCache.get(folder)
  if (hue === undefined) {
    let hash = 0
    for (let index = 0; index < folder.length; index++) {
      hash = (hash * 31 + folder.charCodeAt(index)) | 0
    }
    hue = Math.abs(hash) % 360
    folderHueCache.set(folder, hue)
  }
  return hue
}

export const buildGraphStructureSignature = (data: GraphData | null): string =>
  data
    ? `${data.nodes.map((node) => `${node.id}:${node.degree}`).join('|')}##${data.links
        .map((link) => `${link.source}>${link.target}`)
        .join('|')}`
    : ''

export const findGraphFilterMatches = (
  data: GraphData | null,
  search: string,
): Set<string> | null => {
  const query = search.trim().toLowerCase()
  if (!query || !data) return null
  return new Set(
    data.nodes
      .filter(
        (node) =>
          node.label.toLowerCase().includes(query) ||
          node.id.toLowerCase().includes(query) ||
          node.folder.toLowerCase().includes(query),
      )
      .map((node) => node.id),
  )
}

export const buildGraphAdjacency = (data: GraphData | null): Map<string, Set<string>> => {
  const adjacency = new Map<string, Set<string>>()
  if (!data) return adjacency
  for (const node of data.nodes) adjacency.set(node.id, new Set())
  for (const link of data.links) {
    adjacency.get(link.source)?.add(link.target)
    adjacency.get(link.target)?.add(link.source)
  }
  return adjacency
}
