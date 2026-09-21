import {
  sanitizeDeliveryReport,
  type DeliveryReport,
} from '../../../shared/delivery-report'
import { normalizeWorkspaceRelativePath } from '../../../shared/workspace-state'
import type { DiagnosticRecord, WorkspaceIndex } from '../../../shared/workspace-index'

const MISSING_TARGET_CODES = new Set(['BROKEN_LINK', 'MISSING_ASSET', 'UNRESOLVED_WIKI'])
const MAX_MISSING_TARGETS = 200

const relativeMissingTarget = (diagnostic: DiagnosticRecord): string | null => {
  if (typeof diagnostic.target !== 'string') return null
  return normalizeWorkspaceRelativePath(diagnostic.target)
}

export const buildDeliveryReport = (
  index: WorkspaceIndex | null,
  diagnostics: readonly DiagnosticRecord[],
  options?: { generatedAt?: string; documentCount?: number },
): DeliveryReport => {
  const diagnosticsByCode: Record<string, number> = {}
  const missingTargets: string[] = []
  const seenTargets = new Set<string>()
  for (const diagnostic of diagnostics) {
    diagnosticsByCode[diagnostic.code] = (diagnosticsByCode[diagnostic.code] ?? 0) + 1
    if (!MISSING_TARGET_CODES.has(diagnostic.code) || missingTargets.length >= MAX_MISSING_TARGETS) continue
    const relative = relativeMissingTarget(diagnostic)
    if (!relative || seenTargets.has(relative)) continue
    seenTargets.add(relative)
    missingTargets.push(relative)
  }
  const documentCount =
    typeof options?.documentCount === 'number' && Number.isFinite(options.documentCount)
      ? Math.max(0, Math.floor(options.documentCount))
      : Object.keys(index?.documents ?? {}).length
  const report: DeliveryReport = {
    schemaVersion: 1,
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    documentCount,
    diagnosticsByCode,
    missingTargets,
    indexComplete: Boolean(index?.complete && !index.truncated),
  }
  return sanitizeDeliveryReport(report) ?? report
}

export {
  DELIVERY_REPORT_FILE_NAME,
  serializeDeliveryReport,
  type DeliveryReport,
} from '../../../shared/delivery-report'
