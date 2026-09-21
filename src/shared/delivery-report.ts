import { normalizeWorkspaceRelativePath } from './workspace-state'

export const DELIVERY_REPORT_FILE_NAME = 'paperin-delivery-report.json'
export const MAX_DELIVERY_REPORT_BYTES = 1024 * 1024
export const MAX_DELIVERY_REPORT_TARGETS = 200
export const MAX_DELIVERY_REPORT_CODES = 50

export interface DeliveryReport {
  schemaVersion: 1
  generatedAt: string
  documentCount: number
  diagnosticsByCode: Record<string, number>
  missingTargets: string[]
  indexComplete: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const utf8ByteLength = (text: string): number => new TextEncoder().encode(text).length

const parseNonNegativeInt = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return null
  }
  return value
}

const parseDiagnosticsByCode = (value: unknown): Record<string, number> | null => {
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  if (keys.length > MAX_DELIVERY_REPORT_CODES) return null
  const result: Record<string, number> = {}
  for (const key of keys) {
    if (!key || key.length > 64 || /[\r\n\u0000]/.test(key)) return null
    const count = parseNonNegativeInt(value[key])
    if (count === null) return null
    result[key] = count
  }
  return result
}

const parseMissingTargets = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null
  if (value.length > MAX_DELIVERY_REPORT_TARGETS) return null
  const targets: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') return null
    const path = normalizeWorkspaceRelativePath(item)
    if (!path) return null
    if (seen.has(path)) continue
    seen.add(path)
    targets.push(path)
  }
  return targets
}

/** 只保留白名单字段；正文、绝对路径、搜索词等额外键一律丢弃。 */
export const sanitizeDeliveryReport = (value: unknown): DeliveryReport | null => {
  if (!isRecord(value) || value.schemaVersion !== 1) return null
  if (typeof value.generatedAt !== 'string' || !value.generatedAt || value.generatedAt.length > 64) return null
  if (/[\r\n\u0000]/.test(value.generatedAt)) return null
  const documentCount = parseNonNegativeInt(value.documentCount)
  const diagnosticsByCode = parseDiagnosticsByCode(value.diagnosticsByCode)
  const missingTargets = parseMissingTargets(value.missingTargets)
  if (documentCount === null || diagnosticsByCode === null || missingTargets === null) return null
  if (typeof value.indexComplete !== 'boolean') return null
  return {
    schemaVersion: 1,
    generatedAt: value.generatedAt,
    documentCount,
    diagnosticsByCode,
    missingTargets,
    indexComplete: value.indexComplete,
  }
}

export const serializeDeliveryReport = (report: DeliveryReport): string => {
  const sanitized = sanitizeDeliveryReport(report)
  if (!sanitized) throw new Error('INVALID_ARGUMENT')
  return JSON.stringify(sanitized)
}

export type ExportBundleReportValidation =
  | { ok: true; fileName: string; json: string }
  | { ok: false; code: 'INVALID_ARGUMENT' | 'TOO_LARGE'; message: string }

/**
 * 主进程在任何写盘之前校验交付报告：文件名必须是固定基名，
 * JSON 非空且不超过 1 MiB，字段走白名单。
 */
export const validateExportBundleReport = (
  fileName: unknown,
  json: unknown,
): ExportBundleReportValidation => {
  if (fileName !== DELIVERY_REPORT_FILE_NAME) {
    return { ok: false, code: 'INVALID_ARGUMENT', message: '交付报告文件名不受支持' }
  }
  if (typeof json !== 'string') {
    return { ok: false, code: 'INVALID_ARGUMENT', message: '交付报告内容无效' }
  }
  if (!json.trim()) {
    return { ok: false, code: 'INVALID_ARGUMENT', message: '交付报告为空' }
  }
  if (utf8ByteLength(json) > MAX_DELIVERY_REPORT_BYTES) {
    return { ok: false, code: 'TOO_LARGE', message: '交付报告超过 1MB' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { ok: false, code: 'INVALID_ARGUMENT', message: '交付报告不是合法 JSON' }
  }
  const sanitized = sanitizeDeliveryReport(parsed)
  if (!sanitized) {
    return { ok: false, code: 'INVALID_ARGUMENT', message: '交付报告字段不受支持' }
  }
  return { ok: true, fileName: DELIVERY_REPORT_FILE_NAME, json: JSON.stringify(sanitized) }
}

export const parseOptionalExportBundleReport = (
  report: unknown,
):
  | { ok: true; report?: { fileName: string; json: string } }
  | { ok: false; code: 'INVALID_ARGUMENT' | 'TOO_LARGE'; message: string } => {
  if (report === undefined) return { ok: true }
  if (!isRecord(report)) {
    return { ok: false, code: 'INVALID_ARGUMENT', message: '交付报告格式无效' }
  }
  const validated = validateExportBundleReport(report.fileName, report.json)
  if (!validated.ok) return validated
  return { ok: true, report: { fileName: validated.fileName, json: validated.json } }
}
