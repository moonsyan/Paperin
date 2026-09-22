/** 主进程支持摘要可计数的事件名（不含路径与正文）。 */
export const SUPPORT_EVENT_NAMES = [
  'workspace_open',
  'save_failed',
  'search_cancelled',
] as const

export type SupportEventName = (typeof SUPPORT_EVENT_NAMES)[number]

const SUPPORT_EVENT_NAME_SET = new Set<string>(SUPPORT_EVENT_NAMES)

export const isSupportEventName = (value: string): value is SupportEventName =>
  SUPPORT_EVENT_NAME_SET.has(value)
