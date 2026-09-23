import { basename, dirname, relative, resolve } from 'path'
import type { IndexedDocument } from '../../shared/workspace-index'
import type { WorkspaceIndexServiceDeps } from './workspace-index-service'

export const normalizeResourceKey = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** 资源绝对路径 → 引用该路径的 Markdown 文档路径集合 */
export type ResourceDependencyIndex = Map<string, Set<string>>

export type WorkspaceIndexInvalidation =
  | { kind: 'rescan'; reason: 'directory' | 'unknown' }
  | { kind: 'changes'; markdownPaths: readonly string[]; resourcePaths: readonly string[] }

export const buildResourceDependencyIndex = (
  documents: Record<string, IndexedDocument>,
): ResourceDependencyIndex => {
  const index: ResourceDependencyIndex = new Map()
  const add = (resourcePath: string, sourcePath: string): void => {
    const key = normalizeResourceKey(resourcePath)
    const set = index.get(key)
    if (set) set.add(sourcePath)
    else index.set(key, new Set([sourcePath]))
  }
  for (const document of Object.values(documents)) {
    for (const link of document.outgoingLinks) {
      if (link.resolvedPath) add(link.resolvedPath, document.path)
    }
    for (const ref of document.imageRefs) {
      if (ref.resolvedPath) add(ref.resolvedPath, document.path)
    }
  }
  return index
}

const relativeCandidateKey = (root: string, sourcePath: string, target: string): string | null => {
  if (/^(?:[a-z]+:|\\\\)/i.test(target)) return null
  const resolvedRoot = resolve(root)
  const candidate = resolve(dirname(sourcePath), target)
  const fromRoot = relative(resolvedRoot, candidate)
  if (fromRoot === '..' || fromRoot.startsWith('../') || fromRoot.startsWith('..\\')) return null
  return normalizeResourceKey(candidate)
}

/** Wiki 茎（小写）→ 引用该茎的文档路径 */
const buildWikiStemIndex = (
  documents: Record<string, IndexedDocument>,
): Map<string, Set<string>> => {
  const index = new Map<string, Set<string>>()
  for (const document of Object.values(documents)) {
    for (const link of document.outgoingLinks) {
      if (link.kind !== 'wiki') continue
      const stem = link.target.trim().toLowerCase()
      if (!stem) continue
      const set = index.get(stem)
      if (set) set.add(document.path)
      else index.set(stem, new Set([document.path]))
    }
  }
  return index
}

/**
 * 未解析相对目标键 → 引用文档（已 resolved 的已在 dependencyIndex）。
 * 变更路径命中候选键时需重解析。
 */
const buildRelativeTargetIndex = (
  root: string,
  documents: Record<string, IndexedDocument>,
): Map<string, Set<string>> => {
  const index = new Map<string, Set<string>>()
  const add = (key: string | null, sourcePath: string): void => {
    if (!key) return
    const set = index.get(key)
    if (set) set.add(sourcePath)
    else index.set(key, new Set([sourcePath]))
  }
  for (const document of Object.values(documents)) {
    for (const link of document.outgoingLinks) {
      if (link.resolvedPath) continue
      add(relativeCandidateKey(root, document.path, link.target), document.path)
    }
    for (const ref of document.imageRefs) {
      if (ref.resolvedPath) continue
      add(relativeCandidateKey(root, document.path, ref.target), document.path)
    }
  }
  return index
}

const addAll = (target: Set<string>, sources: Set<string> | undefined): void => {
  if (!sources) return
  sources.forEach((source) => {
    target.add(source)
  })
}

/** 目标路径变化时，找出需重新解析资源引用的文档（不重读正文）；O(变更 + 命中)，禁止按变更全表扫文档 */
export const collectDocumentsAffectedByChanges = (
  root: string,
  documents: Record<string, IndexedDocument>,
  dependencyIndex: ResourceDependencyIndex,
  invalidation: WorkspaceIndexInvalidation | undefined,
): Set<string> => {
  if (!invalidation || invalidation.kind === 'rescan') {
    return new Set(Object.keys(documents))
  }

  const wikiStemIndex = buildWikiStemIndex(documents)
  const relativeTargetIndex = buildRelativeTargetIndex(root, documents)
  const affected = new Set<string>()

  const considerPath = (changedPath: string): void => {
    const key = normalizeResourceKey(changedPath)
    addAll(affected, dependencyIndex.get(key))
    addAll(affected, relativeTargetIndex.get(key))
    const stem = basename(changedPath).replace(/\.(?:md|markdown)$/i, '').toLowerCase()
    if (stem) addAll(affected, wikiStemIndex.get(stem))
  }

  for (const path of invalidation.markdownPaths) considerPath(path)
  for (const path of invalidation.resourcePaths) considerPath(path)
  return affected
}

const withResolvedPath = <T extends { resolvedPath?: string }>(
  item: T,
  resolved: string | null,
): T => {
  if (resolved) return { ...item, resolvedPath: resolved }
  const { resolvedPath: _removed, ...rest } = item
  return rest as T
}

/** 在保留正文解析结果的前提下，重新解析链接与图片目标 */
export const refreshDocumentResources = async (
  document: IndexedDocument,
  root: string,
  resolveResourcePath: WorkspaceIndexServiceDeps['resolveResourcePath'],
): Promise<IndexedDocument> => {
  const outgoingLinks = await Promise.all(
    document.outgoingLinks.map(async (link) => {
      const resolved = await resolveResourcePath(root, link.target, document.path)
      return withResolvedPath(link, resolved)
    }),
  )
  const imageRefs = await Promise.all(
    document.imageRefs.map(async (ref) => {
      const resolved = await resolveResourcePath(root, ref.target, document.path)
      return withResolvedPath(ref, resolved)
    }),
  )
  if (
    outgoingLinks.every((link, index) => link === document.outgoingLinks[index]) &&
    imageRefs.every((ref, index) => ref === document.imageRefs[index])
  ) {
    return document
  }
  return { ...document, outgoingLinks, imageRefs }
}
