// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPanelRegistry } from '../../app/panels/panel-registry'
import { ContextDock } from './index'
import { DEFAULT_CONTEXT_DOCK_STATE } from './context-dock-state'

const renderDock = (state = DEFAULT_CONTEXT_DOCK_STATE) => {
  const onStateChange = vi.fn()
  const view = render(
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
  return { ...view, onStateChange }
}

describe('ContextDock', () => {
  beforeEach(() => {
    cleanup()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  it('keeps the outline visible and exposes panel buttons', () => {
    renderDock()
    expect(screen.getByRole('region', { name: '大纲' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '关系' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '属性' })).toBeTruthy()
  })

  it('switches a dynamic panel through the state updater', () => {
    const { onStateChange } = renderDock()
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
    const { onStateChange } = renderDock({ ...DEFAULT_CONTEXT_DOCK_STATE, visibility: 'collapsed' })
    expect(screen.queryByRole('region', { name: '大纲' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '展开上下文面板' }))
    expect(onStateChange).toHaveBeenCalledTimes(1)
  })

  it('uses registry order and availability for the panel rail', () => {
    const registry = createPanelRegistry()
    registry.register({ id: 'properties', title: '属性', slot: 'sidebar.secondary', order: 1, scope: 'document' })
    registry.register({ id: 'outline', title: '大纲', slot: 'sidebar.secondary', order: 2, scope: 'document' })
    registry.register({ id: 'links', title: '关系', slot: 'sidebar.secondary', order: 3, scope: 'workspace' })
    render(
      <ContextDock
        state={DEFAULT_CONTEXT_DOCK_STATE}
        onStateChange={vi.fn()}
        registry={registry}
        hasWorkspace={false}
        content="# 标题"
        activeFileId="external"
        onOutlineClick={vi.fn()}
        properties={null}
        showProperties={true}
        onToggleProperties={vi.fn()}
        onUpdateProperty={vi.fn()}
        onDeleteProperty={vi.fn()}
        onAddProperty={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('button').slice(0, 2).map((button) => button.getAttribute('aria-label'))).toEqual([
      '属性',
      '大纲',
    ])
    expect(screen.queryByRole('button', { name: '关系' })).toBeNull()
  })

  it('keeps a keyboard-accessible restore control when hidden', () => {
    renderDock({ ...DEFAULT_CONTEXT_DOCK_STATE, visibility: 'hidden' })
    const restore = screen.getByRole('button', { name: '显示上下文面板' })
    expect(restore.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('displays the first available panel when the persisted selection is out of scope', () => {
    const registry = createPanelRegistry()
    const onStateChange = vi.fn()
    registry.register({ id: 'properties', title: '属性', slot: 'sidebar.secondary', scope: 'document' })
    render(
      <ContextDock
        state={{ ...DEFAULT_CONTEXT_DOCK_STATE, panel: 'links' }}
        onStateChange={onStateChange}
        registry={registry}
        hasWorkspace={false}
        content="# 外部文档"
        activeFileId="external"
        onOutlineClick={vi.fn()}
        properties={null}
        showProperties={true}
        onToggleProperties={vi.fn()}
        onUpdateProperty={vi.fn()}
        onDeleteProperty={vi.fn()}
        onAddProperty={vi.fn()}
      />,
    )

    const fallbackButton = within(screen.getByRole('toolbar', { name: '文档上下文面板' }))
      .getByRole('button', { name: '属性' })
    expect(fallbackButton.getAttribute('aria-controls')).toBe('context-dock-panel-properties')
    expect(fallbackButton.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('region', { name: '属性' })).toBeTruthy()
    expect(onStateChange).not.toHaveBeenCalled()
  })

  it('renders custom entries, honors built-in overrides, and reads live registry changes', () => {
    const registry = createPanelRegistry()
    const onStateChange = vi.fn()
    registry.register({
      id: 'plugin.details',
      title: '扩展详情',
      slot: 'sidebar.secondary',
      render: (context) => <p>扩展内容：{context.activeFileId}</p>,
    })
    const createDock = (panel: string) => (
      <ContextDock
        state={{ ...DEFAULT_CONTEXT_DOCK_STATE, panel }}
        onStateChange={onStateChange}
        registry={registry}
        content="# 文档"
        activeFileId="note-id"
        onOutlineClick={vi.fn()}
        properties={null}
        showProperties={true}
        onToggleProperties={vi.fn()}
        onUpdateProperty={vi.fn()}
        onDeleteProperty={vi.fn()}
        onAddProperty={vi.fn()}
      />
    )
    const { rerender } = render(createDock('plugin.details'))
    expect(screen.getByText('扩展内容：note-id')).toBeTruthy()

    registry.register({
      id: 'outline',
      title: '替换大纲',
      slot: 'sidebar.secondary',
      render: () => <p>替换后的内置面板</p>,
    })
    rerender(createDock('outline'))
    expect(screen.getByText('替换后的内置面板')).toBeTruthy()

    registry.register({ id: 'empty.extension', title: '空扩展', slot: 'sidebar.secondary' })
    rerender(createDock('empty.extension'))
    expect(screen.queryByRole('button', { name: '空扩展' })).toBeNull()
    expect(screen.getByText('扩展内容：note-id')).toBeTruthy()
  })

  it('uses the compact rail layout when no registered panel can render', () => {
    const registry = createPanelRegistry()
    registry.register({ id: 'empty.extension', title: '空扩展', slot: 'sidebar.secondary' })
    render(
      <ContextDock
        state={DEFAULT_CONTEXT_DOCK_STATE}
        onStateChange={vi.fn()}
        registry={registry}
        content=""
        activeFileId=""
        onOutlineClick={vi.fn()}
        properties={null}
        showProperties={true}
        onToggleProperties={vi.fn()}
        onUpdateProperty={vi.fn()}
        onDeleteProperty={vi.fn()}
        onAddProperty={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('当前文档上下文').classList.contains('context-dock-empty')).toBe(true)
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.queryByRole('button', { name: '收起上下文面板' })).toBeNull()
    expect(screen.getByRole('button', { name: '隐藏上下文面板' })).toBeTruthy()
  })

  it('cleans resize listeners and body styles on pointer cancellation and unmount', () => {
    document.body.style.cursor = 'wait'
    document.body.style.userSelect = 'text'
    const { onStateChange, unmount } = renderDock()
    const separator = screen.getByRole('separator', { name: '调整上下文面板宽度' })
    expect(separator.getAttribute('aria-valuemin')).toBe('260')
    expect(separator.getAttribute('aria-valuemax')).toBe('420')
    expect(separator.getAttribute('aria-valuenow')).toBe('312')

    fireEvent.pointerDown(separator, { clientX: 400 })
    fireEvent.pointerMove(document, { clientX: 384 })
    expect(onStateChange).toHaveBeenCalledTimes(1)
    fireEvent.pointerCancel(document)
    expect(document.body.style.cursor).toBe('wait')
    expect(document.body.style.userSelect).toBe('text')
    fireEvent.pointerMove(document, { clientX: 360 })
    expect(onStateChange).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(separator, { clientX: 400 })
    fireEvent.pointerMove(document, { clientX: 384 })
    expect(onStateChange).toHaveBeenCalledTimes(2)
    unmount()
    expect(document.body.style.cursor).toBe('wait')
    expect(document.body.style.userSelect).toBe('text')
    fireEvent.pointerMove(document, { clientX: 360 })
    expect(onStateChange).toHaveBeenCalledTimes(2)
  })

  it('collapses on Escape and restores focus to the active panel button', () => {
    const { onStateChange } = renderDock()
    const region = screen.getByRole('region', { name: '大纲' })
    fireEvent.keyDown(region, { key: 'Escape' })
    expect(onStateChange).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '大纲' }))
  })
})
