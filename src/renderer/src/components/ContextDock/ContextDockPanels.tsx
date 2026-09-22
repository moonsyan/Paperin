import { isPanelId } from '../../../../shared/panel-id'
import { FrontmatterProperties } from '../Editor/FrontmatterProperties'
import { QualityPanel } from '../QualityPanel'
import { BacklinksPanel } from '../Sidebar/BacklinksPanel'
import { OutlinePanel } from '../Sidebar/OutlinePanel'
import { TagsPanel } from '../Sidebar/TagsPanel'

import type { WorkspaceTagIndexEntry } from '../../../../shared/tag-index'
import type { DiagnosticRecord, WorkspaceIndex } from '../../../../shared/workspace-index'
import type { PanelContext, PanelDefinition } from '../../app/panels/panel-registry'
import type { BacklinkGraph } from '../../lib/backlinks'
import type { TypographyIssue } from '../../lib/chinese-typography'
import type { SourceHealthRecord } from '../../lib/source-health'
import type { SidebarViewModel } from '../Sidebar/sidebar-view-model'
import type { BuiltInContextDockPanel } from './context-dock-state'

export interface ContextDockContentProps {
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
  onInsertCitation?: (path: string, preview: string) => void
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
  sourceHealth?: SourceHealthRecord[]
  legacySourceCount?: number
  onReviewCurrentDocumentSources?: () => void
  onRelocateSource?: (path: string) => void
  onOpenWorkspaceSearch?: () => void
  properties: Record<string, string> | null
  showProperties: boolean
  onToggleProperties: () => void
  onUpdateProperty: (key: string, value: string) => void
  onDeleteProperty: (key: string) => void
  onAddProperty: (key: string, value: string) => void
}

const NOOP = (): void => undefined
const NOOP_LINK = (_path: string, _query: string): void => undefined
const NOOP_STRING = (_value: string): void => undefined

export const isBuiltInContextDockPanelId = (id: string): id is BuiltInContextDockPanel =>
  id === 'outline' || id === 'links' || id === 'tags' || id === 'properties' || id === 'quality'

export const isRenderableContextDockPanel = (panel: PanelDefinition): boolean =>
  isPanelId(panel.id) && (isBuiltInContextDockPanelId(panel.id) || typeof panel.render === 'function')

export function ContextIcon({ panel }: { panel: string }): JSX.Element {
  if (panel === 'outline') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14" /></svg>
  if (panel === 'links') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a4 4 0 0 0 5.7.3l2-2a4 4 0 0 0-5.7-5.7l-1.1 1.1M14 11a4 4 0 0 0-5.7-.3l-2 2A4 4 0 0 0 8 18.4l1.1-1.1" /></svg>
  if (panel === 'tags') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v6l9 9 6-6-9-9zM8 8h.01" /></svg>
  if (panel === 'properties') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h5M8 17h3" /></svg>
  if (panel === 'quality') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4 4L19 7" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h5" /></svg>
}

interface ContextDockPanelContentProps extends ContextDockContentProps {
  panel: PanelDefinition
  panelContext: PanelContext
}

export function ContextDockPanelContent({
  panel,
  panelContext,
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
  onOpenLink = NOOP_LINK,
  onInsertCitation,
  onUnresolvedLinkClick = NOOP_STRING,
  onOpenGraphView = NOOP,
  tagsFiles = null,
  tagsLoading = false,
  tagsTruncated = false,
  tagFilter = null,
  onToggleTagFilter = NOOP_STRING,
  onOpenWorkspaceFile = NOOP_STRING,
  diagnostics = [],
  indexLoading = false,
  onRefreshIndex,
  onCancelIndex,
  onOpenDiagnostic,
  typographyIssues = [],
  onOpenTypographyIssue,
  onFixTypography,
  sourceHealth = [],
  legacySourceCount = 0,
  onReviewCurrentDocumentSources,
  onRelocateSource,
  onOpenWorkspaceSearch,
  properties,
  showProperties,
  onToggleProperties,
  onUpdateProperty,
  onDeleteProperty,
  onAddProperty,
}: ContextDockPanelContentProps): JSX.Element | null {
  const builtIn = isBuiltInContextDockPanelId(panel.id)
  if (!panel.render && !builtIn) return null

  return (
    <section
      id={`context-dock-panel-${panel.id}`}
      className={`context-dock-section context-dock-${builtIn ? panel.id : 'custom'}`}
      aria-label={panel.title}
    >
      {panel.render?.(panelContext)}
      {!panel.render && panel.id === 'outline' && (
        <OutlinePanel content={content} docKey={activeFileId} activeOutlineIndex={activeOutlineIndex} onOutlineClick={onOutlineClick} />
      )}
      {!panel.render && panel.id === 'links' && (
        <BacklinksPanel graph={workspaceIndex ? null : linkGraph} viewModel={sidebarViewModel} activeFilePath={activeLinkPath} loading={linksLoading} truncated={linksTruncated} onOpenLink={onOpenLink} onInsertCitation={onInsertCitation} onUnresolvedClick={onUnresolvedLinkClick} onOpenGraph={onOpenGraphView} />
      )}
      {!panel.render && panel.id === 'tags' && (
        <TagsPanel files={tagsFiles} loading={tagsLoading} truncated={tagsTruncated} activeTag={tagFilter?.tag ?? null} onToggleTag={onToggleTagFilter} onOpenFile={onOpenWorkspaceFile} />
      )}
      {!panel.render && panel.id === 'properties' && (
        <FrontmatterProperties properties={properties} show={showProperties} onToggle={onToggleProperties} onUpdateProperty={onUpdateProperty} onDeleteProperty={onDeleteProperty} onAddProperty={onAddProperty} />
      )}
      {!panel.render && panel.id === 'quality' && (
        <QualityPanel diagnostics={diagnostics} indexComplete={workspaceIndex?.complete ?? false} indexing={indexLoading} onRefresh={onRefreshIndex} onCancel={onCancelIndex} onOpenDiagnostic={onOpenDiagnostic} typographyIssues={typographyIssues} onOpenTypographyIssue={onOpenTypographyIssue} onFixTypography={onFixTypography} sourceHealth={sourceHealth} legacySourceCount={legacySourceCount} onReviewCurrentDocumentSources={onReviewCurrentDocumentSources} onRelocateSource={onRelocateSource} onOpenWorkspaceSearch={onOpenWorkspaceSearch} />
      )}
    </section>
  )
}
