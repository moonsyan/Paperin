import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import type { BacklinkGraph } from '../../lib/backlinks'
import type { WorkspaceTagIndexEntry } from '../../../../shared/tag-index'
import type { DiagnosticRecord, WorkspaceIndex } from '../../../../shared/workspace-index'
import type { TypographyIssue } from '../../lib/chinese-typography'
import type { ContextDockPanel, ContextDockState } from './context-dock-state'
import { hideContextDock, resizeContextDock, restoreContextDock, selectContextPanel, toggleContextDock } from './context-dock-state'
import { OutlinePanel } from '../Sidebar/OutlinePanel'
import { BacklinksPanel } from '../Sidebar/BacklinksPanel'
import { TagsPanel } from '../Sidebar/TagsPanel'
import { QualityPanel } from '../QualityPanel'
import { FrontmatterProperties } from '../Editor/FrontmatterProperties'
import type { SidebarViewModel } from '../Sidebar/sidebar-view-model'

export interface ContextDockProps {
  state: ContextDockState
  onStateChange: Dispatch<SetStateAction<ContextDockState>>
  content: string
  activeFileId: string
  activeOutlineIndex?: number
  onOutlineClick: (index: number) => void
  linkGraph?: BacklinkGraph | null
  workspaceIndex?: WorkspaceIndex | null
  sidebarViewModel?: Pick<SidebarViewModel, 'generation' | 'activePath' | 'backlinks' | 'outgoing'> | null
  activeLinkPath?: string | null
  linksLoading?: boolean
  linksTruncated?: boolean
  onOpenLink?: (path: string, query: string) => void
  onUnresolvedLinkClick?: (target: string) => void
  onOpenGraphView?: () => void
  tagsFiles?: WorkspaceTagIndexEntry[] | null
  tagsLoading?: boolean
  tagsTruncated?: boolean
  tagFilter?: { tag: string; paths: string[] } | null
  onToggleTagFilter?: (tag: string) => void
  onOpenWorkspaceFile?: (path: string) => void
  diagnostics?: DiagnosticRecord[]
  indexLoading?: boolean
  onRefreshIndex?: () => void
  onCancelIndex?: () => void
  onOpenDiagnostic?: (diagnostic: DiagnosticRecord) => void
  typographyIssues?: TypographyIssue[]
  onOpenTypographyIssue?: (issue: TypographyIssue) => void
  onFixTypography?: () => void
  properties: Record<string, string> | null
  showProperties: boolean
  onToggleProperties: () => void
  onUpdateProperty: (key: string, value: string) => void
  onDeleteProperty: (key: string) => void
  onAddProperty: (key: string, value: string) => void
}

const PANEL_LABELS: Record<ContextDockPanel, string> = {
  outline: '大纲',
  links: '关系',
  tags: '标签',
  properties: '属性',
  quality: '检查',
}

const PANEL_ORDER: ContextDockPanel[] = ['outline', 'links', 'tags', 'properties', 'quality']

function ContextIcon({ panel }: { panel: ContextDockPanel }): JSX.Element {
  if (panel === 'outline') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14" /></svg>
  if (panel === 'links') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a4 4 0 0 0 5.7.3l2-2a4 4 0 0 0-5.7-5.7l-1.1 1.1M14 11a4 4 0 0 0-5.7-.3l-2 2A4 4 0 0 0 8 18.4l1.1-1.1" /></svg>
  if (panel === 'tags') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v6l9 9 6-6-9-9zM8 8h.01" /></svg>
  if (panel === 'properties') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h5M8 17h3" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4 4L19 7" /></svg>
}

export function ContextDock({
  state,
  onStateChange,
  content,
  activeFileId,
  activeOutlineIndex = -1,
  onOutlineClick,
  linkGraph = null,
  workspaceIndex = null,
  sidebarViewModel = null,
  activeLinkPath = null,
  linksLoading = false,
  linksTruncated = false,
  onOpenLink,
  onUnresolvedLinkClick,
  onOpenGraphView,
  tagsFiles = null,
  tagsLoading = false,
  tagsTruncated = false,
  tagFilter = null,
  onToggleTagFilter,
  onOpenWorkspaceFile,
  diagnostics = [],
  indexLoading = false,
  onRefreshIndex,
  onCancelIndex,
  onOpenDiagnostic,
  typographyIssues = [],
  onOpenTypographyIssue,
  onFixTypography,
  properties,
  showProperties,
  onToggleProperties,
  onUpdateProperty,
  onDeleteProperty,
  onAddProperty,
}: ContextDockProps): JSX.Element {
  const hidden = state.visibility === 'hidden'
  const collapsed = state.visibility === 'collapsed'
  const setPanel = (panel: ContextDockPanel) => onStateChange((current) => selectContextPanel(current, panel))

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (hidden) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = state.width
    const handleMove = (moveEvent: PointerEvent) => {
      onStateChange((current) => resizeContextDock(current, startWidth - (moveEvent.clientX - startX)))
    }
    const handleEnd = () => {
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleEnd, { once: true })
  }

  const handleResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const delta = event.key === 'ArrowLeft' ? 16 : -16
    onStateChange((current) => resizeContextDock(current, current.width + delta))
  }

  return (
    <aside
      className={`context-dock context-dock-${state.visibility}`}
      style={{ '--context-dock-w': `${state.width}px` } as CSSProperties}
      aria-label="当前文档上下文"
      aria-hidden={hidden}
    >
      {!hidden && <div
        className="context-dock-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整上下文面板宽度"
        tabIndex={0}
        onPointerDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
      />}
      <div className="context-dock-rail" role="toolbar" aria-label="文档上下文面板">
        {PANEL_ORDER.map((panel) => (
          <button
            key={panel}
            type="button"
            className={`context-dock-btn ${state.panel === panel ? 'active' : ''}`}
            aria-label={PANEL_LABELS[panel]}
            aria-pressed={state.panel === panel && !collapsed}
            title={PANEL_LABELS[panel]}
            onClick={() => setPanel(panel)}
          >
            <ContextIcon panel={panel} />
          </button>
        ))}
        <span className="context-dock-spacer" />
        <button
          type="button"
          className="context-dock-btn"
          aria-label={hidden ? '显示上下文面板' : collapsed ? '展开上下文面板' : '收起上下文面板'}
          title={hidden ? '显示上下文面板' : collapsed ? '展开上下文面板' : '收起上下文面板'}
          onClick={() => onStateChange((current) => hidden ? restoreContextDock(current) : toggleContextDock(current))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={hidden || collapsed ? 'm14 5-7 7 7 7' : 'm10 5 7 7-7 7'} /></svg>
        </button>
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

      {!hidden && !collapsed && (
        <div className="context-dock-content">
          <section className="context-dock-section context-dock-outline" aria-label="大纲">
            <OutlinePanel
              content={content}
              docKey={activeFileId}
              activeOutlineIndex={activeOutlineIndex}
              onOutlineClick={onOutlineClick}
            />
          </section>

          {state.panel !== 'outline' && (
            <section className="context-dock-section context-dock-dynamic" aria-label={PANEL_LABELS[state.panel]}>
              {state.panel === 'links' && (
                <BacklinksPanel
                  graph={workspaceIndex ? null : linkGraph}
                  viewModel={sidebarViewModel}
                  activeFilePath={activeLinkPath}
                  loading={linksLoading}
                  truncated={linksTruncated}
                  onOpenLink={onOpenLink ?? (() => undefined)}
                  onUnresolvedClick={onUnresolvedLinkClick ?? (() => undefined)}
                  onOpenGraph={onOpenGraphView ?? (() => undefined)}
                />
              )}
              {state.panel === 'tags' && (
                <TagsPanel
                  files={tagsFiles}
                  loading={tagsLoading}
                  truncated={tagsTruncated}
                  activeTag={tagFilter?.tag ?? null}
                  onToggleTag={onToggleTagFilter ?? (() => undefined)}
                  onOpenFile={onOpenWorkspaceFile ?? (() => undefined)}
                />
              )}
              {state.panel === 'properties' && (
                <FrontmatterProperties
                  properties={properties}
                  show={showProperties}
                  onToggle={onToggleProperties}
                  onUpdateProperty={onUpdateProperty}
                  onDeleteProperty={onDeleteProperty}
                  onAddProperty={onAddProperty}
                />
              )}
              {state.panel === 'quality' && (
                <QualityPanel
                  diagnostics={diagnostics}
                  indexComplete={workspaceIndex?.complete ?? false}
                  indexing={indexLoading}
                  onRefresh={onRefreshIndex}
                  onCancel={onCancelIndex}
                  onOpenDiagnostic={onOpenDiagnostic}
                  typographyIssues={typographyIssues}
                  onOpenTypographyIssue={onOpenTypographyIssue}
                  onFixTypography={onFixTypography}
                />
              )}
            </section>
          )}
        </div>
      )}
    </aside>
  )
}
