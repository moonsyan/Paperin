import type { WorkspaceIndex } from '../../../../shared/workspace-index'
import type { CompatibilityFixtureManifest } from './manifest'

export interface CompatibilityOpenDiagnostics {
  source: CompatibilityFixtureManifest['source']
  indexComplete: boolean
  truncated: boolean
  diagnosticCodes: Record<string, number>
  expectedUnsupported: string[]
  notes: string[]
}

/** 只读打开后的聚合诊断，不含路径与正文。 */
export const summarizeCompatibilityOpen = (
  manifest: CompatibilityFixtureManifest,
  index: WorkspaceIndex | null,
): CompatibilityOpenDiagnostics => {
  const diagnosticCodes: Record<string, number> = {}
  for (const item of index?.diagnostics ?? []) {
    diagnosticCodes[item.code] = (diagnosticCodes[item.code] ?? 0) + 1
  }
  const notes: string[] = []
  if (!index?.complete || index.truncated) {
    notes.push('index-incomplete')
  }
  if ((diagnosticCodes.MISSING_ASSET ?? 0) > 0) {
    notes.push('missing-attachments-expected')
  }
  if ((diagnosticCodes.BROKEN_LINK ?? 0) > 0 || (diagnosticCodes.UNRESOLVED_WIKI ?? 0) > 0) {
    notes.push('unresolved-links-expected')
  }
  if (manifest.expectedUnsupported.length > 0) {
    notes.push('unsupported-syntax-markers-present')
  }
  return {
    source: manifest.source,
    indexComplete: Boolean(index?.complete && !index.truncated),
    truncated: Boolean(index?.truncated),
    diagnosticCodes,
    expectedUnsupported: [...manifest.expectedUnsupported],
    notes,
  }
}
