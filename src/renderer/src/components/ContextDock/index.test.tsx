// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ContextDock } from './index'
import { DEFAULT_CONTEXT_DOCK_STATE } from './context-dock-state'

const renderDock = (state = DEFAULT_CONTEXT_DOCK_STATE) => {
  const onStateChange = vi.fn()
  render(
    <ContextDock
      state={state}
      onStateChange={onStateChange}
      content="# 标题\n\n正文"
      activeFileId="demo"
      onOutlineClick={vi.fn()}
      properties={null}
      showProperties={true}
      onToggleProperties={vi.fn()}
      onUpdateProperty={vi.fn()}
      onDeleteProperty={vi.fn()}
      onAddProperty={vi.fn()}
    />,
  )
  return onStateChange
}

describe('ContextDock', () => {
  beforeEach(() => cleanup())

  it('keeps the outline visible and exposes panel buttons', () => {
    renderDock()
    expect(screen.getByRole('region', { name: '大纲' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '关系' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '属性' })).toBeTruthy()
  })

  it('switches a dynamic panel through the state updater', () => {
    const onStateChange = renderDock()
    fireEvent.click(screen.getByRole('button', { name: '关系' }))
    expect(onStateChange).toHaveBeenCalledTimes(1)
    const updater = onStateChange.mock.calls[0][0] as (state: typeof DEFAULT_CONTEXT_DOCK_STATE) => typeof DEFAULT_CONTEXT_DOCK_STATE
    expect(updater(DEFAULT_CONTEXT_DOCK_STATE)).toEqual({
      ...DEFAULT_CONTEXT_DOCK_STATE,
      visibility: 'expanded',
      panel: 'links',
    })
  })

  it('renders only the rail while collapsed and can restore it', () => {
    const onStateChange = renderDock({ ...DEFAULT_CONTEXT_DOCK_STATE, visibility: 'collapsed' })
    expect(screen.queryByRole('region', { name: '大纲' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '展开上下文面板' }))
    expect(onStateChange).toHaveBeenCalledTimes(1)
  })
})
