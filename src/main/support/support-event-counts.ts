import { isSupportEventName, type SupportEventName } from '../../shared/support-events'
import { MAX_SUPPORT_SUMMARY_EVENTS } from '../../shared/support-summary'

const eventCounts: Record<string, number> = {}

/** 递增白名单内支持事件计数。 */
export const noteSupportEvent = (name: SupportEventName): void => {
  if (!isSupportEventName(name)) return
  if (!(name in eventCounts) && Object.keys(eventCounts).length >= MAX_SUPPORT_SUMMARY_EVENTS) {
    return
  }
  eventCounts[name] = (eventCounts[name] ?? 0) + 1
}

export const getSupportEventCounts = (): Readonly<Record<string, number>> => ({ ...eventCounts })

export const resetSupportEventCountsForTests = (): void => {
  for (const key of Object.keys(eventCounts)) {
    delete eventCounts[key]
  }
}
