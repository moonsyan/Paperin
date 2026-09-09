export const WORKSPACE_STATE_SCHEMA_VERSION = 1 as const
export const WORKSPACE_LAYOUT_SCHEMA_VERSION = 2 as const
export const MAX_WORKSPACE_TABS = 200
export const MAX_COLLAPSED_DIRECTORIES = 2000
export const MAX_DOCUMENT_VIEW_STATES = 500

const MIN_SIDEBAR_WIDTH = 180
const MAX_SIDEBAR_WIDTH = 600
const DEFAULT_SIDEBAR_WIDTH = 290
const MAX_RELATIVE_PATH_LENGTH = 4096
const THEME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i

/** 侧栏视图（文件/大纲/链接/标签）— 布局持久化与 Sidebar 组件共用 */
export type SidebarView = 'files' | 'outline' | 'links' | 'tags' | 'quality'
export type ContextDockPanel = Exclude<SidebarView, 'files'> | 'properties'
export type ContextDockVisibility = 'expanded' | 'collapsed' | 'hidden'

export interface ContextDockState {
  width: number
  visibility: ContextDockVisibility
  panel: ContextDockPanel
}

type UnknownRecord = Record<string, unknown>

export interface WorkspaceSettingsState {
  schemaVersion: 1
  appearance: {
    theme: string
  }
  editor: {
    attachmentDirectory: string | null
  }
}

export interface WorkspaceTabState {
  path: string
  pinned: boolean
}

export interface WorkspaceLayoutState {
  schemaVersion: 1 | 2
  tabs: WorkspaceTabState[]
  activeTab: string | null
  sidebar: {
    width: number
    activeView: SidebarView
    collapsedDirectories: string[]
  }
  contextDock?: ContextDockState
}

export interface WorkspaceDocumentViewState {
  selection: {
    anchor: number
    head: number
  }
  scrollTop: number
  updatedAt: string
}

export interface WorkspaceDocumentsState {
  schemaVersion: 1
  documents: Record<string, WorkspaceDocumentViewState>
}

export interface WorkspaceStateBundle {
  settings: WorkspaceSettingsState
  layout: WorkspaceLayoutState
  documents: WorkspaceDocumentsState
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettingsState = {
  schemaVersion: WORKSPACE_STATE_SCHEMA_VERSION,
  appearance: { theme: 'inherit' },
  editor: { attachmentDirectory: null },
}

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayoutState = {
  schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
  tabs: [],
  activeTab: null,
  sidebar: {
    width: DEFAULT_SIDEBAR_WIDTH,
    activeView: 'files',
    collapsedDirectories: [],
  },
  contextDock: {
    width: 312,
    visibility: 'expanded',
    panel: 'outline',
  },
}

export const DEFAULT_WORKSPACE_DOCUMENTS: WorkspaceDocumentsState = {
  schemaVersion: WORKSPACE_STATE_SCHEMA_VERSION,
  documents: {},
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

const toDocumentPosition = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

export const normalizeWorkspaceRelativePath = (value: string): string | null => {
  if (typeof value !== 'string') return null
  const normalizedSeparators = value.trim().replace(/\\/g, '/')
  if (!normalizedSeparators || normalizedSeparators.length > MAX_RELATIVE_PATH_LENGTH) return null
  if (normalizedSeparators.startsWith('/') || /^[a-z]:/i.test(normalizedSeparators)) return null

  const segments: string[] = []
  for (const segment of normalizedSeparators.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..' || segment.includes('\0')) return null
    segments.push(segment)
  }
  if (segments.length === 0) return null
  return segments.join('/')
}

export const parseWorkspaceSettings = (value: unknown): WorkspaceSettingsState => {
  const appearance = isRecord(value) && isRecord(value.appearance) ? value.appearance : null
  const requestedTheme = appearance?.theme
  const theme =
    typeof requestedTheme === 'string' && THEME_ID_PATTERN.test(requestedTheme)
      ? requestedTheme
      : 'inherit'
  const editor = isRecord(value) && isRecord(value.editor) ? value.editor : null
  const attachmentDirectory =
    typeof editor?.attachmentDirectory === 'string'
      ? normalizeWorkspaceRelativePath(editor.attachmentDirectory)
      : null
  return {
    schemaVersion: WORKSPACE_STATE_SCHEMA_VERSION,
    appearance: { theme },
    editor: { attachmentDirectory },
  }
}

/** 侧栏视图联合类型（单一来源）：新增视图时此处与 Sidebar 组件同步扩展 */
const SIDEBAR_VIEWS: readonly SidebarView[] = ['files', 'outline', 'links', 'tags', 'quality']
const isSidebarView = (value: unknown): value is SidebarView =>
  typeof value === 'string' && (SIDEBAR_VIEWS as readonly string[]).includes(value)

export const parseWorkspaceLayout = (value: unknown): WorkspaceLayoutState => {
  const source = isRecord(value) ? value : {}
  const sourceTabs = Array.isArray(source.tabs) ? source.tabs : []
  const seenTabs = new Set<string>()
  const tabs: WorkspaceTabState[] = []
  for (const candidate of sourceTabs) {
    if (!isRecord(candidate) || typeof candidate.path !== 'string') continue
    const path = normalizeWorkspaceRelativePath(candidate.path)
    if (!path || seenTabs.has(path)) continue
    seenTabs.add(path)
    tabs.push({ path, pinned: candidate.pinned === true })
    if (tabs.length >= MAX_WORKSPACE_TABS) break
  }

  const requestedActiveTab =
    typeof source.activeTab === 'string'
      ? normalizeWorkspaceRelativePath(source.activeTab)
      : null
  const activeTab = requestedActiveTab && seenTabs.has(requestedActiveTab)
    ? requestedActiveTab
    : null

  const sidebar = isRecord(source.sidebar) ? source.sidebar : {}
  const legacyActiveView = isSidebarView(sidebar.activeView) ? sidebar.activeView : 'files'
  const requestedCollapsed = Array.isArray(sidebar.collapsedDirectories)
    ? sidebar.collapsedDirectories
    : []
  const collapsedDirectories: string[] = []
  const seenDirectories = new Set<string>()
  for (const candidate of requestedCollapsed) {
    if (typeof candidate !== 'string') continue
    const path = normalizeWorkspaceRelativePath(candidate)
    if (!path || seenDirectories.has(path)) continue
    seenDirectories.add(path)
    collapsedDirectories.push(path)
    if (collapsedDirectories.length >= MAX_COLLAPSED_DIRECTORIES) break
  }

  const dock = isRecord(source.contextDock) ? source.contextDock : null
  const contextPanel = dock && typeof dock.panel === 'string' &&
      ['outline', 'links', 'tags', 'properties', 'quality'].includes(dock.panel)
    ? dock.panel as ContextDockPanel
    : legacyActiveView === 'files' ? 'outline' : legacyActiveView
  const contextVisibility = dock && typeof dock.visibility === 'string' &&
      ['expanded', 'collapsed', 'hidden'].includes(dock.visibility)
    ? dock.visibility as ContextDockVisibility
    : 'expanded'
  const contextWidth = dock && typeof dock.width === 'number' && Number.isFinite(dock.width) &&
      dock.width >= 260 && dock.width <= 420
    ? Math.round(dock.width)
    : 312

  return {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    tabs,
    activeTab,
    sidebar: {
      width: clampNumber(
        sidebar.width,
        DEFAULT_SIDEBAR_WIDTH,
        MIN_SIDEBAR_WIDTH,
        MAX_SIDEBAR_WIDTH,
      ),
      activeView: 'files',
      collapsedDirectories,
    },
    contextDock: {
      width: contextWidth,
      visibility: contextVisibility,
      panel: contextPanel,
    },
  }
}

export const parseWorkspaceDocuments = (value: unknown): WorkspaceDocumentsState => {
  const source = isRecord(value) && isRecord(value.documents) ? value.documents : {}
  const validEntries: Array<[string, WorkspaceDocumentViewState]> = []

  for (const [candidatePath, candidate] of Object.entries(source)) {
    const path = normalizeWorkspaceRelativePath(candidatePath)
    if (!path || !isRecord(candidate) || !isRecord(candidate.selection)) continue
    const updatedTime = typeof candidate.updatedAt === 'string'
      ? Date.parse(candidate.updatedAt)
      : Number.NaN
    if (!Number.isFinite(updatedTime)) continue
    validEntries.push([
      path,
      {
        selection: {
          anchor: toDocumentPosition(candidate.selection.anchor),
          head: toDocumentPosition(candidate.selection.head),
        },
        scrollTop: clampNumber(candidate.scrollTop, 0, 0, Number.MAX_SAFE_INTEGER),
        updatedAt: new Date(updatedTime).toISOString(),
      },
    ])
  }

  validEntries.sort((left, right) =>
    Date.parse(right[1].updatedAt) - Date.parse(left[1].updatedAt),
  )

  return {
    schemaVersion: WORKSPACE_STATE_SCHEMA_VERSION,
    documents: Object.fromEntries(validEntries.slice(0, MAX_DOCUMENT_VIEW_STATES)),
  }
}
