export const SUPPORT_SUMMARY_SCHEMA_VERSION = 1 as const
export const MAX_SUPPORT_SUMMARY_CODES = 50
export const MAX_SUPPORT_SUMMARY_EVENTS = 50
export const MAX_SUPPORT_SUMMARY_ERROR_CODES = 20
export const MAX_SUPPORT_SUMMARY_STRING_LENGTH = 128

export interface SupportSummaryV1 {
  schemaVersion: typeof SUPPORT_SUMMARY_SCHEMA_VERSION
  appVersion: string
  platform: string
  arch: string
  electronVersion: string
  autoUpdateEnabled: boolean
  /** 本地枚举事件计数（不含正文与路径） */
  eventCounts: Record<string, number>
  workspace: {
    documentCount: number
    indexComplete: boolean
    diagnosticsByCode: Record<string, number>
  }
  recentErrorCodes: string[]
}

export interface SupportSummaryEnvironment {
  appVersion: string
  platform: string
  arch: string
  electronVersion: string
  autoUpdateEnabled: boolean
  eventCounts: Record<string, number>
  recentErrorCodes: string[]
}

export interface SupportSummaryWorkspaceInput {
  documentCount: number
  indexComplete: boolean
  diagnosticsByCode: Record<string, number>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseNonNegativeInt = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return null
  }
  return value
}

export const isForbiddenSupportSummaryString = (value: string): boolean => {
  if (!value || value.length > MAX_SUPPORT_SUMMARY_STRING_LENGTH) return true
  if (/[\r\n\u0000]/.test(value)) return true
  if (/[/\\]/.test(value)) return true
  if (/[A-Za-z]:\\/.test(value)) return true
  return false
}

const parseCountMap = (
  value: unknown,
  maxKeys: number,
): Record<string, number> | null => {
  if (!isRecord(value)) return null
  const keys = Object.keys(value)
  if (keys.length > maxKeys) return null
  const result: Record<string, number> = {}
  for (const key of keys) {
    if (!key || isForbiddenSupportSummaryString(key)) return null
    const count = parseNonNegativeInt(value[key])
    if (count === null) return null
    result[key] = count
  }
  return result
}

const parseErrorCodes = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null
  if (value.length > MAX_SUPPORT_SUMMARY_ERROR_CODES) return null
  const codes: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || isForbiddenSupportSummaryString(item)) return null
    if (!/^[A-Z0-9_]+$/.test(item)) return null
    if (!codes.includes(item)) codes.push(item)
  }
  return codes
}

const parseSafeString = (value: unknown): string | null => {
  if (typeof value !== 'string' || isForbiddenSupportSummaryString(value)) return null
  return value
}

/** 白名单字段；额外键、路径形字符串与敏感键一律丢弃。 */
export const sanitizeSupportSummary = (value: unknown): SupportSummaryV1 | null => {
  if (!isRecord(value) || value.schemaVersion !== SUPPORT_SUMMARY_SCHEMA_VERSION) return null
  const appVersion = parseSafeString(value.appVersion)
  const platform = parseSafeString(value.platform)
  const arch = parseSafeString(value.arch)
  const electronVersion = parseSafeString(value.electronVersion)
  if (!appVersion || !platform || !arch || !electronVersion) return null
  if (typeof value.autoUpdateEnabled !== 'boolean') return null
  const eventCounts = parseCountMap(value.eventCounts, MAX_SUPPORT_SUMMARY_EVENTS)
  const recentErrorCodes = parseErrorCodes(value.recentErrorCodes)
  if (!eventCounts || !recentErrorCodes) return null
  if (!isRecord(value.workspace)) return null
  const documentCount = parseNonNegativeInt(value.workspace.documentCount)
  const diagnosticsByCode = parseCountMap(value.workspace.diagnosticsByCode, MAX_SUPPORT_SUMMARY_CODES)
  if (documentCount === null || diagnosticsByCode === null) return null
  if (typeof value.workspace.indexComplete !== 'boolean') return null
  return {
    schemaVersion: SUPPORT_SUMMARY_SCHEMA_VERSION,
    appVersion,
    platform,
    arch,
    electronVersion,
    autoUpdateEnabled: value.autoUpdateEnabled,
    eventCounts,
    workspace: {
      documentCount,
      indexComplete: value.workspace.indexComplete,
      diagnosticsByCode,
    },
    recentErrorCodes,
  }
}

export const buildSupportSummary = (
  environment: SupportSummaryEnvironment,
  workspace: SupportSummaryWorkspaceInput,
): SupportSummaryV1 => {
  const draft: SupportSummaryV1 = {
    schemaVersion: SUPPORT_SUMMARY_SCHEMA_VERSION,
    appVersion: environment.appVersion,
    platform: environment.platform,
    arch: environment.arch,
    electronVersion: environment.electronVersion,
    autoUpdateEnabled: environment.autoUpdateEnabled,
    eventCounts: { ...environment.eventCounts },
    workspace: {
      documentCount: workspace.documentCount,
      indexComplete: workspace.indexComplete,
      diagnosticsByCode: { ...workspace.diagnosticsByCode },
    },
    recentErrorCodes: [...environment.recentErrorCodes],
  }
  return sanitizeSupportSummary(draft) ?? draft
}

export const serializeSupportSummary = (summary: SupportSummaryV1): string => {
  const sanitized = sanitizeSupportSummary(summary)
  if (!sanitized) throw new Error('INVALID_ARGUMENT')
  return `${JSON.stringify(sanitized, null, 2)}\n`
}

export const scanSupportSummaryForForbiddenContent = (json: string): boolean => {
  if (/token|Bearer|main\.log|lastSearchQuery|contentSha256|"body"|"query"|"preview"/i.test(json)) {
    return true
  }
  if (/[A-Za-z]:\\|\/Users\/|\/home\//.test(json)) return true
  return false
}
