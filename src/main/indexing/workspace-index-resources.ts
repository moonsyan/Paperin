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

/** 目标路径变化时，找出需重新解析资源引用的文档（不重读正文） */
export const collectDocumentsAffectedByChanges = (
  root: string,
  documents: Record<string, IndexedDocument>,
  dependencyIndex: ResourceDependencyIndex,
  invalidation: WorkspaceIndexInvalidation | undefined,
): Set<string> => {
  if (!invalidation || invalidation.kind === 'rescan') {
    return new Set(Object.keys(documents))
  }

  const affected = new Set<string>()
  const considerPath = (changedPath: string): void => {
    const key = normalizeResourceKey(changedPath)
    dependencyIndex.get(key)?.forEach((source) => affected.add(source))
    for (const [docPath, document] of Object.entries(documents)) {
      for (const link of document.outgoingLinks) {
        if (link.resolvedPath && normalizeResourceKey(link.resolvedPath) === key) {
          affected.add(docPath)
        }
        const targetKey = relativeCandidateKey(root, document.path, link.target)
        if (targetKey === key) affected.add(docPath)
        if (link.kind === 'wiki') {
          const stem = basename(changedPath).replace(/\.(?:md|markdown)$/i, '')
          if (stem && link.target.toLowerCase() === stem.toLowerCase()) affected.add(docPath)
        }
      }
      for (const ref of document.imageRefs) {
        if (ref.resolvedPath && normalizeResourceKey(ref.resolvedPath) === key) {
          affected.add(docPath)
        }
        const targetKey = relativeCandidateKey(root, document.path, ref.target)
        if (targetKey === key) affected.add(docPath)
      }
    }
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