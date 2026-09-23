import { isPanelId } from '../../../../shared/panel-id'

import type { PanelId } from '../../../../shared/panel-id'

export type ContextDockPanel = PanelId
export type BuiltInContextDockPanel = 'outline' | 'links' | 'tags' | 'properties' | 'quality'
export type ContextDockVisibility = 'expanded' | 'collapsed' | 'hidden'

export interface ContextDockState {
  visibility: ContextDockVisibility
  panel: ContextDockPanel
  width: number
  /**
   * 轻量大纲形态（NEXT-UI-SPEC §5.2 / T13）：仅当活动面板为大纲时生效。
   * 进入时收到建议窄栏（≤240）；可拖范围 200–420。呈现变化（藏字数等），
   * 不创建第二套大纲状态。
   */
  compact: boolean
}

export const DEFAULT_CONTEXT_DOCK_STATE: ContextDockState = {
  visibility: 'expanded',
  panel: 'outline',
  width: 312,
  compact: false,
}

/** 轻量形态默认窄栏；可拖下限仍为 200，上限与完整面板一致，避免顶在 240 时左拖无反馈 */
export const MIN_COMPACT_WIDTH = 200
export const MAX_COMPACT_WIDTH = 240
export const DEFAULT_COMPACT_WIDTH = 220

const CONTEXT_DOCK_VISIBILITIES: readonly ContextDockVisibility[] = [
  'expanded',
  'collapsed',
  'hidden',
]
export const MIN_CONTEXT_DOCK_WIDTH = 260
export const MAX_CONTEXT_DOCK_WIDTH = 420

/** 当前形态下的可拖宽度上下限（轻量 200–420 / 完整 260–420） */
export const getContextDockWidthBounds = (
  compact: boolean,
): { min: number; max: number } =>
  compact
    ? { min: MIN_COMPACT_WIDTH, max: MAX_CONTEXT_DOCK_WIDTH }
    : { min: MIN_CONTEXT_DOCK_WIDTH, max: MAX_CONTEXT_DOCK_WIDTH }

export const resizeContextDock = (state: ContextDockState, width: number): ContextDockState => {
  const { min, max } = getContextDockWidthBounds(state.compact)
  return {
    ...state,
    width: Math.min(max, Math.max(min, Math.round(width))),
  }
}

const isContextDockVisibility = (value: unknown): value is ContextDockVisibility =>
  typeof value === 'string' && CONTEXT_DOCK_VISIBILITIES.includes(value as ContextDockVisibility)

const clampWidth = (value: unknown, compact: boolean): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CONTEXT_DOCK_STATE.width
  const min = compact ? MIN_COMPACT_WIDTH : MIN_CONTEXT_DOCK_WIDTH
  const max = MAX_CONTEXT_DOCK_WIDTH
  if (value < min || value > max) {
    return DEFAULT_CONTEXT_DOCK_STATE.width
  }
  return Math.round(value)
}

export const parseContextDockState = (value: unknown): ContextDockState => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_CONTEXT_DOCK_STATE }
  }
  const source = value as Record<string, unknown>
  const panel = isPanelId(source.panel) ? source.panel : DEFAULT_CONTEXT_DOCK_STATE.panel
  const visibility = isContextDockVisibility(source.visibility)
    ? source.visibility
    : DEFAULT_CONTEXT_DOCK_STATE.visibility
  // 旧 schema 无 compact 字段：缺省 false（完整形态），向后兼容
  const compact = source.compact === true
  return { visibility, panel, width: clampWidth(source.width, compact), compact }
}

/** 切换轻量/完整形态（仅大纲面板时有意义） */
export const setDockCompact = (state: ContextDockState, compact: boolean): ContextDockState => {
  if (compact) {
    // 进入轻量：宽于建议窄栏时收到 240，左右都有可拖余量；已在窄栏内则保持
    let width = state.width
    if (width > MAX_COMPACT_WIDTH) width = MAX_COMPACT_WIDTH
    if (width < MIN_COMPACT_WIDTH) width = DEFAULT_COMPACT_WIDTH
    return { ...state, compact: true, width }
  }
  if (state.width < MIN_CONTEXT_DOCK_WIDTH) {
    return { ...state, compact: false, width: MIN_CONTEXT_DOCK_WIDTH }
  }
  return { ...state, compact: false }
}
export const selectContextPanel = (
  state: ContextDockState,
  panel: ContextDockPanel,
): ContextDockState => {
  if (!isPanelId(panel)) return state
  return {
    ...state,
    panel,
    visibility: state.panel === panel && state.visibility === 'expanded' ? 'collapsed' : 'expanded',
  }
}

export const toggleContextDock = (state: ContextDockState): ContextDockState => ({
  ...state,
  visibility: state.visibility === 'expanded' ? 'collapsed' : 'expanded',
})

export const hideContextDock = (state: ContextDockState): ContextDockState => ({
  ...state,
  visibility: 'hidden',
})

export const restoreContextDock = (state: ContextDockState): ContextDockState => ({
  ...state,
  visibility: 'expanded',
})
