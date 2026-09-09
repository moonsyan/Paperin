export type PanelId = string

export const MAX_PANEL_ID_LENGTH = 64

const PANEL_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/

/** 面板 ID 会进入布局持久化与 DOM id，限制为稳定、无空白的 ASCII 标识。 */
export const isPanelId = (value: unknown): value is PanelId =>
  typeof value === 'string' &&
  value.length <= MAX_PANEL_ID_LENGTH &&
  PANEL_ID_PATTERN.test(value)
