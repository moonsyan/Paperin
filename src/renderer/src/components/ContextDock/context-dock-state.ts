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
   * 轻量大纲形态（NEXT-UI-SPEC §5.2 / T13）：仅当活动面板为大纲时生效，
   * 宽度钳制到 200–240px 的窄栏展示。是同一 dock 的呈现变化，
   * 不创建第二套大纲状态、滚动监听或持久化机制。
   */
  compact: boolean
}

export const DEFAULT_CONTEXT_DOCK_STATE: ContextDockState = {
  visibility: 'expanded',
  panel: 'outline',
  width: 312,
  compact: false,
}

/** 轻量形态的宽度钳制范围 */
export const MIN_COMPACT_WIDTH = 200
export const MAX_COMPACT_WIDTH = 240

const CONTEXT_DOCK_VISIBILITIES: readonly ContextDockVisibility[] = [
  'expanded',
  'collapsed',
  'hidden',
]
export const MIN_CONTEXT_DOCK_WIDTH = 260
export const MAX_CONTEXT_DOCK_WIDTH = 420

export const resizeContextDock = (state: ContextDockState, width: number): ContextDockState => ({
  ...state,
  width: Math.min(MAX_CONTEXT_DOCK_WIDTH, Math.max(MIN_CONTEXT_DOCK_WIDTH, Math.round(width))),
})

const isContextDockVisibility = (value: unknown): value is ContextDockVisibility =>
  typeof value === 'string' && CONTEXT_DOCK_VISIBILITIES.includes(value as ContextDockVisibility)

const clampWidth = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CONTEXT_DOCK_STATE.width
  if (value < MIN_CONTEXT_DOCK_WIDTH || value > MAX_CONTEXT_DOCK_WIDTH) {
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
  return { visibility, panel, width: clampWidth(source.width), compact }
}

/** 切换轻量/完整形态（仅大纲面板时有意义） */
export const setDockCompact = (state: ContextDockState, compact: boolean): ContextDockState => ({
  ...state,
  compact,
})

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
