export type ContextDockPanel = 'outline' | 'links' | 'tags' | 'properties' | 'quality'
export type ContextDockVisibility = 'expanded' | 'collapsed' | 'hidden'

export interface ContextDockState {
  visibility: ContextDockVisibility
  panel: ContextDockPanel
  width: number
}

export const DEFAULT_CONTEXT_DOCK_STATE: ContextDockState = {
  visibility: 'expanded',
  panel: 'outline',
  width: 312,
}

const CONTEXT_DOCK_PANELS: readonly ContextDockPanel[] = [
  'outline',
  'links',
  'tags',
  'properties',
  'quality',
]
const CONTEXT_DOCK_VISIBILITIES: readonly ContextDockVisibility[] = [
  'expanded',
  'collapsed',
  'hidden',
]
const MIN_CONTEXT_DOCK_WIDTH = 260
const MAX_CONTEXT_DOCK_WIDTH = 420

export const resizeContextDock = (state: ContextDockState, width: number): ContextDockState => ({
  ...state,
  width: Math.min(MAX_CONTEXT_DOCK_WIDTH, Math.max(MIN_CONTEXT_DOCK_WIDTH, Math.round(width))),
})

const isContextDockPanel = (value: unknown): value is ContextDockPanel =>
  typeof value === 'string' && CONTEXT_DOCK_PANELS.includes(value as ContextDockPanel)

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
  const panel = isContextDockPanel(source.panel) ? source.panel : DEFAULT_CONTEXT_DOCK_STATE.panel
  const visibility = isContextDockVisibility(source.visibility)
    ? source.visibility
    : DEFAULT_CONTEXT_DOCK_STATE.visibility
  return { visibility, panel, width: clampWidth(source.width) }
}

export const selectContextPanel = (
  state: ContextDockState,
  panel: ContextDockPanel,
): ContextDockState => ({
  ...state,
  panel,
  visibility: state.panel === panel && state.visibility === 'expanded' ? 'collapsed' : 'expanded',
})

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
