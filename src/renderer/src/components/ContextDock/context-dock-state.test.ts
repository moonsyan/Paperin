import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONTEXT_DOCK_STATE,
  hideContextDock,
  parseContextDockState,
  resizeContextDock,
  restoreContextDock,
  selectContextPanel,
  setDockCompact,
  toggleContextDock,
} from './context-dock-state'

describe('ContextDock state', () => {
  it('uses an expanded outline dock with the default width', () => {
    expect(DEFAULT_CONTEXT_DOCK_STATE).toEqual({
      visibility: 'expanded',
      panel: 'outline',
      width: 312,
      compact: false,
    })
  })

  it('collapses when the active panel is selected again', () => {
    expect(selectContextPanel(DEFAULT_CONTEXT_DOCK_STATE, 'outline')).toEqual({
      visibility: 'collapsed',
      panel: 'outline',
      width: 312,
      compact: false,
    })
  })

  it('expands and switches when another panel is selected', () => {
    const collapsed = toggleContextDock(DEFAULT_CONTEXT_DOCK_STATE)
    expect(selectContextPanel(collapsed, 'links')).toEqual({
      visibility: 'expanded',
      panel: 'links',
      width: 312,
      compact: false,
    })
  })

  it('restores the previous panel and width after being hidden', () => {
    const hidden = hideContextDock({ visibility: 'expanded', panel: 'tags', width: 380, compact: false })
    expect(hidden.visibility).toBe('hidden')
    expect(restoreContextDock(hidden)).toEqual({
      visibility: 'expanded',
      panel: 'tags',
      width: 380,
      compact: false,
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
      compact: false,
    })
  })

  it('preserves safe custom panel ids across selection and persistence', () => {
    const selected = selectContextPanel(DEFAULT_CONTEXT_DOCK_STATE, 'plugin.details')
    expect(selected.panel).toBe('plugin.details')
    expect(parseContextDockState({ ...selected, visibility: 'collapsed' })).toEqual({
      visibility: 'collapsed',
      panel: 'plugin.details',
      width: 312,
      compact: false,
    })
    expect(selectContextPanel(selected, '../unsafe')).toBe(selected)
  })

  it('clamps resized widths to the supported range', () => {
    expect(resizeContextDock(DEFAULT_CONTEXT_DOCK_STATE, 100)).toMatchObject({ width: 260 })
    expect(resizeContextDock(DEFAULT_CONTEXT_DOCK_STATE, 999)).toMatchObject({ width: 420 })
    expect(resizeContextDock(DEFAULT_CONTEXT_DOCK_STATE, 333.7)).toMatchObject({ width: 334 })
  })
})

describe('ContextDock compact（轻量大纲形态，T13）', () => {
  it('旧 schema 无 compact 字段时缺省 false（向后兼容）', () => {
    expect(parseContextDockState({ visibility: 'expanded', panel: 'outline', width: 312 }).compact).toBe(false)
  })

  it('持久化的 compact=true 能被恢复', () => {
    const parsed = parseContextDockState({ visibility: 'expanded', panel: 'outline', width: 312, compact: true })
    expect(parsed.compact).toBe(true)
  })

  it('setDockCompact 切换形态且不改动其他字段', () => {
    const next = setDockCompact(DEFAULT_CONTEXT_DOCK_STATE, true)
    expect(next).toEqual({ ...DEFAULT_CONTEXT_DOCK_STATE, compact: true })
    expect(setDockCompact(next, false).compact).toBe(false)
  })

  it('compact 与宽度互相独立：resize 不改形态，切换不改宽度', () => {
    const compacted = setDockCompact(resizeContextDock(DEFAULT_CONTEXT_DOCK_STATE, 380), true)
    expect(compacted.width).toBe(380)
    expect(setDockCompact(compacted, false).width).toBe(380)
  })
})
