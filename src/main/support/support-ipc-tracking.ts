import type { SupportEventName } from '../../shared/support-events'
import { noteSupportEvent } from './support-event-counts'
import { noteSupportErrorCode } from './recent-error-codes'

/** 用户主动取消对话框时不写入 recentErrorCodes，避免噪声。 */
const SKIP_RECENT_ERROR_CODES = new Set(['CANCELLED'])

export interface SupportIpcFailureOptions {
  failureEvent?: SupportEventName
  /** 为 true 时 CANCELLED 也会进入 recentErrorCodes（如搜索取消）。 */
  recordCancelledError?: boolean
}

export const recordSupportIpcFailure = (
  code: unknown,
  options?: SupportIpcFailureOptions,
): void => {
  if (typeof code !== 'string' || !code) return
  if (!SKIP_RECENT_ERROR_CODES.has(code) || options?.recordCancelledError) {
    noteSupportErrorCode(code)
  }
  if (options?.failureEvent) noteSupportEvent(options.failureEvent)
}

export const trackSupportIpcResult = <T extends { ok: boolean; error?: { code?: string } }>(
  result: T,
  options?: SupportIpcFailureOptions,
): T => {
  if (!result.ok) {
    recordSupportIpcFailure(result.error?.code, options)
  }
  return result
}
