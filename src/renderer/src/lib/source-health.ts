import { normalizeWorkspaceRelativePath } from '../../../shared/workspace-state'
import type { SourceSnapshot } from '../../../shared/workspace-state'
import type { IndexedDocument, WorkspaceIndex } from '../../../shared/workspace-index'

export type SourceHealthStatus = 'current' | 'changed' | 'missing' | 'unverified'

export interface SourceHealthRecord {
  path: string
  status: SourceHealthStatus
}

const documentByRelativePath = (index: WorkspaceIndex): Map<string, IndexedDocument> => {
  const byRelative = new Map<string, IndexedDocument>()
  for (const document of Object.values(index.documents)) {
    const relative = normalizeWorkspaceRelativePath(document.relativePath.replace(/\\/g, '/'))
    if (relative && !byRelative.has(relative)) byRelative.set(relative, document)
  }
  return byRelative
}

/** 只用相对路径 + mtime 派生状态，不读正文、不算哈希、不猜测新路径。 */
export const evaluateSourceHealth = (
  snapshots: readonly SourceSnapshot[],
  index: WorkspaceIndex | null,
): SourceHealthRecord[] => {
  const incomplete = !index || !index.complete || index.truncated
  const byRelative = index ? documentByRelativePath(index) : new Map<string, IndexedDocument>()
  return snapshots.map((snapshot) => {
    if (incomplete) return { path: snapshot.path, status: 'unverified' }
    const document = byRelative.get(snapshot.path)
    if (!document) return { path: snapshot.path, status: 'missing' }
    if (document.modifiedTime === snapshot.modifiedTime) {
      return { path: snapshot.path, status: 'current' }
    }
    return { path: snapshot.path, status: 'changed' }
  })
}
