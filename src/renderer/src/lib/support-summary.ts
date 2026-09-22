import {
  buildSupportSummary,
  type SupportSummaryEnvironment,
  type SupportSummaryV1,
} from '../../../shared/support-summary'
import type { DiagnosticRecord, WorkspaceIndex } from '../../../shared/workspace-index'

export const aggregateDiagnosticsByCode = (
  diagnostics: readonly DiagnosticRecord[],
): Record<string, number> => {
  const diagnosticsByCode: Record<string, number> = {}
  for (const diagnostic of diagnostics) {
    diagnosticsByCode[diagnostic.code] = (diagnosticsByCode[diagnostic.code] ?? 0) + 1
  }
  return diagnosticsByCode
}

export const buildSupportSummaryFromWorkspace = (
  environment: SupportSummaryEnvironment,
  index: WorkspaceIndex | null,
  diagnostics: readonly DiagnosticRecord[],
): SupportSummaryV1 => {
  const documentCount = Object.keys(index?.documents ?? {}).length
  return buildSupportSummary(environment, {
    documentCount,
    indexComplete: Boolean(index?.complete && !index.truncated),
    diagnosticsByCode: aggregateDiagnosticsByCode(diagnostics),
  })
}
