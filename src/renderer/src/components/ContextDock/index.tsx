import { useEffect, useRef } from 'react'
import type {
  CSSProperties,
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  SetStateAction,
} from 'react'

import { sharedPanelRegistry } from '../../app/panels/shared-panel-registry'
import {
  ContextDockPanelContent,
  ContextIcon,
  isRenderableContextDockPanel,
} from './ContextDockPanels'
import {
  getContextDockWidthBounds,
  hideContextDock,
  resizeContextDock,
  restoreContextDock,
  selectContextPanel,
  setDockCompact,
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
  // 轻量大纲：展示与拖拽共用 state.width（进入时收到建议窄栏，之后可拖到 420）
  const compact = state.compact === true && activePanel?.id === 'outline'
  const { min: widthMin, max: widthMax } = getContextDockWidthBounds(compact)
  const effectiveWidth = Math.min(widthMax, Math.max(widthMin, state.width))

  useEffect(() => () => {
    resizeCleanupRef.current?.()
    resizeCleanupRef.current = null
  }, [])

  const handlePanelSelect = (panel: ContextDockPanel): void => {
    onStateChange((current) => selectContextPanel(current, panel))
  }

  const handleResizeStart = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (hidden || event.button !== 0) return
    event.preventDefault()
    resizeCleanupRef.current?.()
    const startX = event.clientX
    const startWidth = effectiveWidth
    const dock = event.currentTarget.closest('.context-dock')
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    const handleMove = (moveEvent: MouseEvent): void => {
      if (!Number.isFinite(moveEvent.clientX)) return
      onStateChange((current) => {
        const next = resizeContextDock({ ...current, compact }, startWidth - (moveEvent.clientX - startX))
        return { ...next, compact: current.compact }
      })
    }
    const cleanup = (): void => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleEnd)
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      dock?.classList.remove('context-dock-resizing')
    }
    const handleEnd = (): void => {
      cleanup()
      if (resizeCleanupRef.current === cleanup) resizeCleanupRef.current = null
    }
    dock?.classList.add('context-dock-resizing')
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    resizeCleanupRef.current = cleanup
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleEnd)
  }

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? 16 : -16
    onStateChange((current) => {
      const next = resizeContextDock({ ...current, compact }, effectiveWidth + delta)
      return { ...next, compact: current.compact }
    })
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
      className={`context-dock context-dock-${state.visibility}${panels.length === 0 ? ' context-dock-empty' : ''}${compact ? ' context-dock-compact' : ''}`}
      style={{ '--context-dock-w': `${effectiveWidth}px` } as CSSProperties}
      aria-label={hidden ? '上下文面板已隐藏' : '当前文档上下文'}
    >
      {!hidden && !effectivelyCollapsed && (
        <div
          className="context-dock-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整上下文面板宽度"
          aria-valuemin={widthMin}
          aria-valuemax={widthMax}
          aria-valuenow={effectiveWidth}
          tabIndex={0}
          onMouseDown={handleResizeStart}
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
        {/* 轻量大纲切换（T13）：仅大纲面板展开时可用；同一 dock 的呈现变化 */}
        {!hidden && !effectivelyCollapsed && activePanel?.id === 'outline' && (
          <button
            type="button"
            className={`context-dock-btn ${compact ? 'active' : ''}`}
            aria-label={compact ? '切换为完整大纲' : '切换为轻量大纲'}
            aria-pressed={compact}
            title={compact ? '切换为完整大纲' : '切换为轻量大纲（窄栏）'}
            onClick={() => onStateChange((current) => setDockCompact(current, !current.compact))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M4 12h10M4 18h13" />
            </svg>
          </button>
        )}
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
