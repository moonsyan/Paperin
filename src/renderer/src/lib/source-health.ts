import {
  baselinesForCitingDocument,
  reviewCitingDocumentBaselines,
  type ReviewSourceBaselineInput,
} from '../../../shared/source-tracking'
import { normalizeWorkspaceRelativePath } from '../../../shared/workspace-state'
import type { DocumentSourceBaseline, LegacySourceSnapshot } from '../../../shared/source-tracking'
import type { IndexedDocument, WorkspaceIndex } from '../../../shared/workspace-index'
import type { WorkspaceSettingsState } from '../../../shared/workspace-state'

export type SourceHealthStatus = 'current' | 'changed' | 'missing' | 'unverified'

export type SourceHealthScope = 'current-document' | 'legacy-unknown'

export interface SourceHealthRecord {
  path: string
  status: SourceHealthStatus
  scope: SourceHealthScope
}

const documentByRelativePath = (index: WorkspaceIndex): Map<string, IndexedDocument> => {
  const byRelative = new Map<string, IndexedDocument>()
  for (const document of Object.values(index.documents)) {
    const relative = normalizeWorkspaceRelativePath(document.relativePath.replace(/\\/g, '/'))
    if (relative && !byRelative.has(relative)) byRelative.set(relative, document)
  }
  return byRelative
}

const evaluateSnapshot = (
  path: string,
  modifiedTime: number,
  incomplete: boolean,
  byRelative: Map<string, IndexedDocument>,
): SourceHealthRecord => {
  if (incomplete) return { path, status: 'unverified', scope: 'current-document' }
  const document = byRelative.get(path)
  if (!document) return { path, status: 'missing', scope: 'current-document' }
  if (document.modifiedTime === modifiedTime) {
    return { path, status: 'current', scope: 'current-document' }
  }
  return { path, status: 'changed', scope: 'current-document' }
}

/** 只用相对路径 + mtime 派生状态，不读正文、不算哈希、不猜测新路径。 */
export const evaluateSourceHealth = (
  baselines: readonly DocumentSourceBaseline[],
  index: WorkspaceIndex | null,
  options?: { legacySnapshots?: readonly LegacySourceSnapshot[] },
): SourceHealthRecord[] => {
  const incomplete = !index || !index.complete || index.truncated
  const byRelative = index ? documentByRelativePath(index) : new Map<string, IndexedDocument>()
  const documentRecords = baselines.map((baseline) =>
    evaluateSnapshot(baseline.sourcePath, baseline.modifiedTime, incomplete, byRelative),
  )
  const legacyRecords = (options?.legacySnapshots ?? []).map((snapshot) => ({
    ...evaluateSnapshot(snapshot.path, snapshot.modifiedTime, incomplete, byRelative),
    scope: 'legacy-unknown' as const,
  }))
  return [...documentRecords, ...legacyRecords]
}

export const evaluateCurrentDocumentSourceHealth = (
  baselines: readonly DocumentSourceBaseline[],
  citingDocumentPath: string | null,
  caseInsensitive: boolean,
  index: WorkspaceIndex | null,
  options?: { legacySnapshots?: readonly LegacySourceSnapshot[] },
): SourceHealthRecord[] => {
  if (!citingDocumentPath) {
    return evaluateSourceHealth([], index, options)
  }
  const scoped = baselinesForCitingDocument(baselines, citingDocumentPath, caseInsensitive)
  return evaluateSourceHealth(scoped, index, options)
}

export const buildReviewInputsFromIndex = (
  baselines: readonly DocumentSourceBaseline[],
  citingDocumentPath: string,
  caseInsensitive: boolean,
  index: WorkspaceIndex | null,
): ReviewSourceBaselineInput[] => {
  if (!index || !index.complete || index.truncated) return []
  const byRelative = documentByRelativePath(index)
  return baselinesForCitingDocument(baselines, citingDocumentPath, caseInsensitive)
    .map((baseline) => {
      const document = byRelative.get(baseline.sourcePath)
      if (!document) return null
      return { sourcePath: baseline.sourcePath, modifiedTime: document.modifiedTime }
    })
    .filter((item): item is ReviewSourceBaselineInput => item !== null)
}

export const reviewCurrentDocumentInSettings = (
  settings: WorkspaceSettingsState,
  citingDocumentPath: string,
  reviews: readonly ReviewSourceBaselineInput[],
  caseInsensitive: boolean,
): WorkspaceSettingsState => ({
  ...settings,
  editor: {
    ...settings.editor,
    documentSourceBaselines: reviewCitingDocumentBaselines(
      settings.editor.documentSourceBaselines,
      citingDocumentPath,
      reviews,
      caseInsensitive,
    ),
  },
})
