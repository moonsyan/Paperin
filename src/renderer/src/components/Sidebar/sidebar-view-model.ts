import type { WorkspaceIndex, DiagnosticRecord } from '../../../../shared/workspace-index'
import type { BacklinkEdge } from '../../lib/backlinks'
import { collectDiagnostics } from '../../lib/diagnostics'

export type SidebarDataView = 'files' | 'outline' | 'tags' | 'links' | 'quality'
export interface SidebarFileItem { path: string; name: string; relativePath: string; tags: string[] }
export interface SidebarTagItem { name: string; paths: string[] }
export interface SidebarOutlineItem { level: number; text: string; line: number }
export interface SidebarViewModel {
  generation: number
  view: SidebarDataView
  activePath: string | null
  files: SidebarFileItem[]
  tags: SidebarTagItem[]
  backlinks: BacklinkEdge[]
  outgoing: BacklinkEdge[]
  diagnostics: DiagnosticRecord[]
  outline: SidebarOutlineItem[]
}

const edgeFromLink = (sourcePath: string, link: WorkspaceIndex['links'][number]): BacklinkEdge => ({
  sourcePath,
  targetPath: link.resolvedPath ?? null,
  target: link.target,
  alias: undefined,
  line: link.line,
  preview: `${link.target}`,
  kind: link.kind,
})

export const buildSidebarViewModel = (
  index: WorkspaceIndex,
  activePath: string | null,
  view: SidebarDataView = 'files',
): SidebarViewModel => {
  const needsFiles = view === 'files' || view === 'tags'
  const needsTags = view === 'tags'
  const needsLinks = view === 'links'
  const needsDiagnostics = view === 'quality'
  const activeDocument = activePath ? index.documents[activePath] : undefined
  const indexedFiles = needsFiles
    ? Object.values(index.documents)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-Hans-CN'))
      .map((document) => ({ path: document.path, name: document.name, relativePath: document.relativePath, tags: [...document.tags] }))
    : []
  const files = view === 'files' ? indexedFiles : []
  const tagMap = new Map<string, SidebarTagItem>()
  if (needsTags) for (const file of indexedFiles) for (const tag of file.tags) {
    const key = tag.toLowerCase(); const item = tagMap.get(key) ?? { name: tag, paths: [] }
    if (!item.paths.includes(file.path)) item.paths.push(file.path)
    tagMap.set(key, item)
  }
  const tags = Array.from(tagMap.values()).sort((a, b) => b.paths.length - a.paths.length || a.name.localeCompare(b.name, 'zh-Hans-CN'))
  const edges = needsLinks ? index.links.map((link) => edgeFromLink(link.sourcePath, link)) : []
  const lowerActive = activePath?.toLowerCase() ?? ''
  const backlinks = edges.filter((edge) => edge.targetPath?.toLowerCase() === lowerActive).sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.line - b.line)
  const outgoing = edges.filter((edge) => edge.sourcePath.toLowerCase() === lowerActive).sort((a, b) => a.line - b.line)
  return {
    generation: index.generation,
    view,
    activePath,
    files,
    tags,
    backlinks,
    outgoing,
    diagnostics: needsDiagnostics ? collectDiagnostics(index) : [],
    outline: activeDocument && view === 'outline' ? activeDocument.headings.map((heading) => ({ level: heading.level, text: heading.text, line: heading.line })) : [],
  }
}
