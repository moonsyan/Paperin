import { useEffect, useRef } from 'react'
import type {
  CSSProperties,
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react'

import { sharedPanelRegistry } from '../../app/panels/shared-panel-registry'
import {
  ContextDockPanelContent,
  ContextIcon,
  isRenderableContextDockPanel,
} from './ContextDockPanels'
import {
  MAX_CONTEXT_DOCK_WIDTH,
  MIN_CONTEXT_DOCK_WIDTH,
  hideContextDock,
  resizeContextDock,
  restoreContextDock,
  selectContextPanel,
  toggleContextDock,
} from './context-dock-state'

import type { PanelContext, PanelRegistry } from '../../app/panels/panel-registry'
import type { ContextDockContentProps } from './ContextDockPanels'
import type { ContextDockPanel, ContextDockState } from './context-dock-state'

export interface ContextDockProps extends ContextDockContentProps {
  state: ContextDockState
  onStateChange: Dispatch<SetStateAction<ContextDockState>>
  registry?: PanelRegistry
  hasWorkspace?: boolean
  hasActiveDocument?: boolean
}

const DEFAULT_PANEL_REGISTRY = sharedPanelRegistry

export function ContextDock({
  state,
  onStateChange,
  registry = DEFAULT_PANEL_REGISTRY,
  hasWorkspace = true,
  hasActiveDocument,
  ...contentProps
}: ContextDockProps): JSX.Element {
  const hidden = state.visibility === 'hidden'
  const collapsed = state.visibility === 'collapsed'
  const panelButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const resizeCleanupRef = useRef<(() => void) | null>(null)
  const activeFileId = hasActiveDocument === false ? '' : contentProps.activeFileId
  const panelContext: PanelContext = { activeFileId, hasWorkspace }
  const panels = registry
    .list('sidebar.secondary', panelContext)
    .filter(isRenderableContextDockPanel)
  const activePanel = panels.find((panel) => panel.id === state.panel) ?? panels[0]
  const effectivelyCollapsed = collapsed || panels.length === 0

  useEffect(() => () => {
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
  }, [])

  const handlePanelSelect = (panel: ContextDockPanel): void => {
    onStateChange((current) => selectContextPanel(current, panel))
  }

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (hidden) return
    event.preventDefault()
    resizeCleanupRef.current?.()
    const startX = event.clientX
    const startWidth = state.width
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    const handleMove = (moveEvent: PointerEvent): void => {
      onStateChange((current) => resizeContextDock(current, startWidth - (moveEvent.clientX - startX)))
    }
    const cleanup = (): void => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleEnd)
      document.removeEventListener('pointercancel', handleEnd)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
    const handleEnd = (): void => {
      cleanup()
      if (resizeCleanupRef.current === cleanup) resizeCleanupRef.current = null
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    resizeCleanupRef.current = cleanup
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleEnd)
    document.addEventListener('pointercancel', handleEnd)
  }

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? 16 : -16
    onStateChange((current) => resizeContextDock(current, current.width + delta))
  }

  const handleContentKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !activePanel) return
    event.preventDefault()
    event.stopPropagation()
    onStateChange((current) => (
      current.visibility === 'expanded' ? { ...current, visibility: 'collapsed' } : current
    ))
    panelButtonRefs.current.get(activePanel.id)?.focus()
  }

  const visibilityLabel = hidden
    ? '显示上下文面板'
    : collapsed
      ? '展开上下文面板'
      : '收起上下文面板'

  return (
    <aside
      className={`context-dock context-dock-${state.visibility}${panels.length === 0 ? ' context-dock-empty' : ''}`}
      style={{ '--context-dock-w': `${state.width}px` } as CSSProperties}
      aria-label={hidden ? '上下文面板已隐藏' : '当前文档上下文'}
    >
      {!hidden && !effectivelyCollapsed && (
        <div
          className="context-dock-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整上下文面板宽度"
          aria-valuemin={MIN_CONTEXT_DOCK_WIDTH}
          aria-valuemax={MAX_CONTEXT_DOCK_WIDTH}
          aria-valuenow={state.width}
          tabIndex={0}
          onPointerDown={handleResizeStart}
          onKeyDown={handleResizeKeyDown}
        />
      )}

      <div className="context-dock-rail" role="toolbar" aria-label="文档上下文面板">
        {!hidden && panels.map((panel) => {
          const active = activePanel?.id === panel.id
          return (
            <button
              key={panel.id}
              ref={(element) => {
                if (element) panelButtonRefs.current.set(panel.id, element)
                else panelButtonRefs.current.delete(panel.id)
              }}
              type="button"
              className={`context-dock-btn ${active ? 'active' : ''}`}
              aria-label={panel.title}
              aria-controls={`context-dock-panel-${panel.id}`}
              aria-pressed={active && !collapsed}
              title={panel.title}
              onClick={() => handlePanelSelect(panel.id)}
            >
              <ContextIcon panel={panel.id} />
            </button>
          )
        })}
        <span className="context-dock-spacer" />
        {(hidden || panels.length > 0) && (
          <button
            type="button"
            className="context-dock-btn"
            aria-label={visibilityLabel}
            title={visibilityLabel}
            onClick={() => onStateChange((current) => (
              hidden ? restoreContextDock(current) : toggleContextDock(current)
            ))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={hidden || collapsed ? 'm14 5-7 7 7 7' : 'm10 5 7 7-7 7'} />
            </svg>
          </button>
        )}
        {!hidden && (
          <button
            type="button"
            className="context-dock-btn"
            aria-label="隐藏上下文面板"
            title="隐藏上下文面板"
            onClick={() => onStateChange((current) => hideContextDock(current))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        )}
      </div>

      {!hidden && !effectivelyCollapsed && activePanel && (
        <div className="context-dock-content" onKeyDown={handleContentKeyDown}>
          <ContextDockPanelContent
            {...contentProps}
            panel={activePanel}
            panelContext={panelContext}
          />
        </div>
      )}
    </aside>
  )
}
