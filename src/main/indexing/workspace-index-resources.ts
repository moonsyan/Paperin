import { basename } from 'path'
import type { IndexedDocument } from '../../shared/workspace-index'
import type { WorkspaceIndexServiceDeps } from './workspace-index-service'
import {
  dirnameWorkspacePath,
  relativeWorkspacePath,
  resolveWorkspacePath,
} from './workspace-path'

export const normalizeResourceKey = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

/** 资源绝对路径 → 引用该路径的 Markdown 文档路径集合 */
export type ResourceDependencyIndex = Map<string, Set<string>>

export type WorkspaceIndexInvalidation =
  | { kind: 'rescan'; reason: 'directory' | 'unknown' }
  | { kind: 'changes'; markdownPaths: readonly string[]; resourcePaths: readonly string[] }

export interface ResourceLookupIndexes {
  dependency: ResourceDependencyIndex
  wikiStem: Map<string, Set<string>>
  relativeTarget: Map<string, Set<string>>
}

const relativeCandidateKey = (root: string, sourcePath: string, target: string): string | null => {
  if (/^(?:[a-z]+:|\\\\)/i.test(target)) return null
  const resolvedRoot = resolveWorkspacePath(root)
  const candidate = resolveWorkspacePath(dirnameWorkspacePath(sourcePath), target)
  const fromRoot = relativeWorkspacePath(resolvedRoot, candidate)
  if (fromRoot === '..' || fromRoot.startsWith('../') || fromRoot.startsWith('..\\')) return null
  return normalizeResourceKey(candidate)
}

const addToIndex = (index: Map<string, Set<string>>, key: string, sourcePath: string): void => {
  const set = index.get(key)
  if (set) set.add(sourcePath)
  else index.set(key, new Set([sourcePath]))
}

/** 单次遍历文档构建依赖 / wiki 茎 / 未解析相对目标三类索引 */
export const buildResourceLookupIndexes = (
  root: string,
  documents: Record<string, IndexedDocument>,
): ResourceLookupIndexes => {
  const dependency: ResourceDependencyIndex = new Map()
  const wikiStem = new Map<string, Set<string>>()
  const relativeTarget = new Map<string, Set<string>>()

  for (const document of Object.values(documents)) {
    for (const link of document.outgoingLinks) {
      if (link.resolvedPath) {
        addToIndex(dependency, normalizeResourceKey(link.resolvedPath), document.path)
      } else {
        const key = relativeCandidateKey(root, document.path, link.target)
        if (key) addToIndex(relativeTarget, key, document.path)
      }
      if (link.kind === 'wiki') {
        const stem = link.target.trim().toLowerCase()
        if (stem) addToIndex(wikiStem, stem, document.path)
      }
    }
    for (const ref of document.imageRefs) {
      if (ref.resolvedPath) {
        addToIndex(dependency, normalizeResourceKey(ref.resolvedPath), document.path)
      } else {
        const key = relativeCandidateKey(root, document.path, ref.target)
        if (key) addToIndex(relativeTarget, key, document.path)
      }
    }
  }

  return { dependency, wikiStem, relativeTarget }
}

export const buildResourceDependencyIndex = (
  documents: Record<string, IndexedDocument>,
): ResourceDependencyIndex => {
  // 无 root 时相对目标索引为空；仅依赖已 resolved 路径（兼容旧调用）
  return buildResourceLookupIndexes('', documents).dependency
}

const addAll = (target: Set<string>, sources: Set<string> | undefined): void => {
  if (!sources) return
  sources.forEach((source) => {
    target.add(source)
  })
}

/** 目标路径变化时，找出需重新解析资源引用的文档（不重读正文）；O(变更 + 命中) */
export const collectDocumentsAffectedByChanges = (
  root: string,
  documents: Record<string, IndexedDocument>,
  dependencyIndex: ResourceDependencyIndex,
  invalidation: WorkspaceIndexInvalidation | undefined,
  lookupIndexes?: Pick<ResourceLookupIndexes, 'wikiStem' | 'relativeTarget'>,
): Set<string> => {
  if (!invalidation || invalidation.kind === 'rescan') {
    return new Set(Object.keys(documents))
  }

  const indexes =
    lookupIndexes ??
    (() => {
      const built = buildResourceLookupIndexes(root, documents)
      return { wikiStem: built.wikiStem, relativeTarget: built.relativeTarget }
    })()

  const affected = new Set<string>()

  const considerPath = (changedPath: string): void => {
    const key = normalizeResourceKey(changedPath)
    addAll(affected, dependencyIndex.get(key))
    addAll(affected, indexes.relativeTarget.get(key))
    const stem = basename(changedPath).replace(/\.(?:md|markdown)$/i, '').toLowerCase()
    if (stem) addAll(affected, indexes.wikiStem.get(stem))
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
