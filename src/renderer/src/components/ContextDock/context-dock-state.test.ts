import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTEXT_DOCK_STATE,
  hideContextDock,
  parseContextDockState,
  resizeContextDock,
  restoreContextDock,
  selectContextPanel,
  toggleContextDock,
} from './context-dock-state'

describe('ContextDock state', () => {
  it('uses an expanded outline dock with the default width', () => {
    expect(DEFAULT_CONTEXT_DOCK_STATE).toEqual({
      visibility: 'expanded',
      panel: 'outline',
      width: 312,
    })
  })

  it('collapses when the active panel is selected again', () => {
    expect(selectContextPanel(DEFAULT_CONTEXT_DOCK_STATE, 'outline')).toEqual({
      visibility: 'collapsed',
      panel: 'outline',
      width: 312,
    })
  })

  it('expands and switches when another panel is selected', () => {
    const collapsed = toggleContextDock(DEFAULT_CONTEXT_DOCK_STATE)
    expect(selectContextPanel(collapsed, 'links')).toEqual({
      visibility: 'expanded',
      panel: 'links',
      width: 312,
    })
  })

  it('restores the previous panel and width after being hidden', () => {
    const hidden = hideContextDock({ visibility: 'expanded', panel: 'tags', width: 380 })
    expect(hidden.visibility).toBe('hidden')
    expect(restoreContextDock(hidden)).toEqual({
      visibility: 'expanded',
      panel: 'tags',
      width: 380,
    })
  })

  it('normalizes invalid persisted values to safe defaults', () => {
    expect(parseContextDockState({ visibility: 'broken', panel: '../unknown', width: 9999 })).toEqual(
      DEFAULT_CONTEXT_DOCK_STATE,
    )
    expect(parseContextDockState({ visibility: 'collapsed', panel: 'quality', width: 260 })).toEqual({
      visibility: 'collapsed',
      panel: 'quality',
      width: 260,
    })
  })

  it('preserves safe custom panel ids across selection and persistence', () => {
    const selected = selectContextPanel(DEFAULT_CONTEXT_DOCK_STATE, 'plugin.details')
    expect(selected.panel).toBe('plugin.details')
    expect(parseContextDockState({ ...selected, visibility: 'collapsed' })).toEqual({
      visibility: 'collapsed',
      panel: 'plugin.details',
      width: 312,
    })
    expect(selectContextPanel(selected, '../unsafe')).toBe(selected)
  })

  it('clamps resized widths to the supported range', () => {
    expect(resizeContextDock(DEFAULT_CONTEXT_DOCK_STATE, 100)).toMatchObject({ width: 260 })
    expect(resizeContextDock(DEFAULT_CONTEXT_DOCK_STATE, 999)).toMatchObject({ width: 420 })
    expect(resizeContextDock(DEFAULT_CONTEXT_DOCK_STATE, 333.7)).toMatchObject({ width: 334 })
  })
})
