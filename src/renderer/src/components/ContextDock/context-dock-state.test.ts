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

  it('持久化 compact 宽度允许 200–420', () => {
    expect(
      parseContextDockState({ visibility: 'expanded', panel: 'outline', width: 220, compact: true }),
    ).toMatchObject({ width: 220, compact: true })
    expect(
      parseContextDockState({ visibility: 'expanded', panel: 'outline', width: 312, compact: true }),
    ).toMatchObject({ width: 312, compact: true })
  })

  it('进入轻量时宽于建议窄栏则收到 240', () => {
    const next = setDockCompact(DEFAULT_CONTEXT_DOCK_STATE, true)
    expect(next).toEqual({ ...DEFAULT_CONTEXT_DOCK_STATE, compact: true, width: 240 })
    expect(setDockCompact(next, false)).toEqual({ ...DEFAULT_CONTEXT_DOCK_STATE, width: 260 })
  })

  it('进入轻量时已在窄栏内则保持宽度', () => {
    const narrow = { ...DEFAULT_CONTEXT_DOCK_STATE, width: 220 }
    expect(setDockCompact(narrow, true)).toEqual({ ...narrow, compact: true, width: 220 })
  })

  it('compact 下拖拽下限 200、上限与完整面板同为 420', () => {
    const compactState = { ...DEFAULT_CONTEXT_DOCK_STATE, compact: true, width: 240 }
    expect(resizeContextDock(compactState, 100)).toMatchObject({ width: 200, compact: true })
    expect(resizeContextDock(compactState, 999)).toMatchObject({ width: 420, compact: true })
    expect(resizeContextDock(compactState, 220.4)).toMatchObject({ width: 220, compact: true })
  })

  it('退出 compact 时若宽度低于完整面板下限则抬到 260', () => {
    const narrow = { ...DEFAULT_CONTEXT_DOCK_STATE, compact: true, width: 220 }
    expect(setDockCompact(narrow, false)).toEqual({
      ...DEFAULT_CONTEXT_DOCK_STATE,
      compact: false,
      width: 260,
    })
  })
})
