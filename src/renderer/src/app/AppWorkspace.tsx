import type { CSSProperties, RefObject, Dispatch, SetStateAction } from 'react'
import { Sidebar } from '../components/Sidebar'
import type { WorkspaceInfo, OpenFile } from '../components/Sidebar'
import { ContextDock } from '../components/ContextDock'
import type { ContextDockState } from '../components/ContextDock/context-dock-state'
import { Editor } from '../components/Editor'
import type { EditorHandle } from '../components/Editor'
import { EditorMargin } from '../components/EditorMargin'
import type { PanelContext } from '../app/panels/panel-registry'
import { SearchBar } from '../components/SearchBar'
import { GraphView } from '../components/GraphView'
import type { GraphSettings } from '../components/GraphView'
import { DocumentPathbar } from '../components/DocumentPathbar'
import type { DocumentPathKind } from '../components/DocumentPathbar'
import { StartScreen } from '../components/StartScreen'
import { DEMO_FILES, DEMO_TREE, DEFAULT_FILE_ID } from '../data/demo-files'
import type { WorkspaceIndex, DiagnosticRecord } from '../../../shared/workspace-index'
import type { TypographyIssue } from '../lib/chinese-typography'
import type { SearchBarHandlers } from './useEditorSearch'
import { SKIP_LINK_TARGET_ID } from './SkipLink'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppWorkspaceProps {
  // 布局
  editorAreaRef: RefObject<HTMLDivElement>
  sidebarWidth: number
  /** 有效可见性（窄窗口抽屉协调后）：false = 隐藏，含持久化收起与互斥退出 */
  sidebarCollapsed: boolean
  onToggleSidebar: (trigger?: HTMLElement) => void
  onStartSidebarResize: (e: React.MouseEvent) => void
  /** 窄窗口抽屉遮罩属性（useWorkspaceDrawers）；null = 不渲染 */
  scrimProps?: { className: string; onClick: () => void; 'aria-hidden': true } | null
  /** ContextDock 有效可见性（窄窗口互斥）：false = 瞬时隐藏（不改持久化偏好） */
  contextDockVisible?: boolean
  // 搜索
  searchMode: 'find' | 'replace' | 'none'
  searchEpoch: number
  searchCount: number
  searchCurrent: number
  searchPref: { query: string; useRegex: boolean; caseSensitive: boolean; wholeWord: boolean; replacement: string }
  searchHandlers: SearchBarHandlers
  onCloseSearch: () => void
  // 文档
  openFiles: OpenFile[]
  activeFileId: string
  activeFilePath: string | undefined
  activeContent: string
  /** 当前文档路径条形态（示例/未命名/库内/外部）；无活动文档时不渲染路径条 */
  activePathKind?: DocumentPathKind
  /** 路径条「定位到文件」：展开侧栏并展开当前文件的祖先目录 */
  onRevealActiveFile?: () => void
  // 工作区
  workspace: WorkspaceInfo | null
  demoFileNames: Record<string, string>
  currentCollapsedKeys: string[] | null
  onCollapsedKeysChange: (keys: string[]) => void
  collapseFoldersOnOpen: boolean
  // 侧栏五段式导航
  onOpenSearch: () => void
  /** 搜索触发框快捷键提示（当前快捷键映射的 commandPalette 组合键） */
  searchShortcut?: string
  recentFiles: Array<{ path: string; name: string }>
  favorites: string[]
  onToggleFavorite: (path: string) => void
  onOpenSettings: () => void
  // 文件操作
  onSelectDemoFile: (id: string, pinned?: boolean) => void
  onSelectWorkspaceFile: (path: string, pinned?: boolean) => void
  onCreateFile: (dir: string) => void
  onRenameFile: (path: string, name: string) => void
  onDeleteFile: (path: string) => void
  onMoveFile: (path: string, targetDir: string) => void
  onOpenInNewWindow: (path: string) => void
  // 图谱
  graphTabOpen: boolean
  graphTabActive: boolean
  /** 关闭图谱视图（图谱面板内的关闭按钮；标签栏上的关闭在顶栏） */
  onGraphTabClose: () => void
  onGraphOpenNode: (path: string) => void
  linkGraph: unknown
  linksTruncated: boolean
  graphSettings: GraphSettings
  onGraphSettingsChange: (settings: GraphSettings) => void
  // 编辑器
  editorRef: RefObject<EditorHandle>
  onEditorChange: (content: string) => void
  onCursorChange: (line: number, col: number, heading: string, headingIndex: number, selected: number) => void
  onRichRender: () => void
  blankClickToEnd: boolean
  codeLineNumbers: boolean
  onNotify: (message: string) => void
  wikiLinkFiles: Array<{ name: string; path: string }>
  onWikiLinkClick: (target: string) => void
  wikiResolveTest: ((target: string) => boolean) | undefined
  onFullscreenChange: (open: boolean) => void
  imageHints: Record<string, unknown>
  // 预览
  previewMode: boolean
  previewPaneRef: RefObject<HTMLDivElement>
  previewContentRef: RefObject<HTMLDivElement>
  // 开始界面
  onNew: () => void
  onOpen: () => void
  onOpenFolder: () => void
  // ContextDock
  contextDockState: ContextDockState
  onContextDockStateChange: Dispatch<SetStateAction<ContextDockState>>
  workspaceIndex: WorkspaceIndex | null
  indexLoading: boolean
  diagnostics: DiagnosticRecord[]
  onRefreshIndex: () => void
  onCancelIndex: () => void
  onOpenDiagnostic: (diagnostic: DiagnosticRecord) => void
  sidebarViewModel: unknown
  linksLoading: boolean
  onOpenLink: (path: string, query: string) => void
  onOpenGraphView: () => void
  tagIndex: { files: Array<{ path: string; tags: string[]; mtimeMs: number; size: number }> } | null
  tagsLoading: boolean
  tagsTruncated: boolean
  tagFilter: { tag: string; paths: string[] } | null
  onToggleTagFilter: (tag: string) => void
  typographyIssues: TypographyIssue[]
  onOpenTypographyIssue: (issue: TypographyIssue) => void
  onFixTypography: () => void
  activeProperties: unknown
  showFrontmatterProps: boolean
  onToggleProperties: () => void
  onUpdateProperty: (key: string, value: string) => void
  onDeleteProperty: (key: string) => void
  onAddProperty: (key: string, value: string) => void
  activeOutlineIndex: number
  onOutlineClick: (index: number) => void
  focusEditorSoon: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * 工作区主体视图：侧栏文件树 + 编辑器区（标签栏/正文/图谱/预览） + 右侧上下文面板。
 *
 * 职责边界：
 * - 纯布局与展示组件，所有状态和操作由父组件传入
 * - 封装 Sidebar + Editor + ContextDock 的组合关系
 * - 处理侧栏折叠/拖拽、搜索栏、图谱覆盖层、预览分栏的渲染逻辑
 *
 * 扩展方式：新增工作区子面板只需添加 props 和对应 JSX 块
 */
export function AppWorkspace(props: AppWorkspaceProps): JSX.Element {
  const {
    editorAreaRef, sidebarWidth, sidebarCollapsed, onToggleSidebar, onStartSidebarResize,
    scrimProps, contextDockVisible,
    searchMode, searchEpoch, searchCount, searchCurrent, searchPref, searchHandlers, onCloseSearch,
    openFiles, activeFileId, activeFilePath, activeContent,
    activePathKind, onRevealActiveFile,
    workspace, demoFileNames, currentCollapsedKeys, onCollapsedKeysChange, collapseFoldersOnOpen,
    onOpenSearch, searchShortcut, recentFiles, favorites, onToggleFavorite, onOpenSettings,
    onSelectDemoFile, onSelectWorkspaceFile, onCreateFile, onRenameFile, onDeleteFile, onMoveFile, onOpenInNewWindow,
    graphTabOpen, graphTabActive, onGraphTabClose, onGraphOpenNode,
    linkGraph, linksTruncated, graphSettings, onGraphSettingsChange,
    editorRef, onEditorChange, onCursorChange, onRichRender, blankClickToEnd, codeLineNumbers,
    onNotify, wikiLinkFiles, onWikiLinkClick, wikiResolveTest, onFullscreenChange, imageHints,
    previewMode, previewPaneRef, previewContentRef,
    onNew, onOpen, onOpenFolder,
    contextDockState, onContextDockStateChange, workspaceIndex, indexLoading, diagnostics,
    onRefreshIndex, onCancelIndex, onOpenDiagnostic, sidebarViewModel, linksLoading,
    onOpenLink, onOpenGraphView, tagIndex, tagsLoading, tagsTruncated, tagFilter, onToggleTagFilter,
    typographyIssues, onOpenTypographyIssue, onFixTypography,
    activeProperties, showFrontmatterProps, onToggleProperties, onUpdateProperty, onDeleteProperty, onAddProperty,
    activeOutlineIndex, onOutlineClick, focusEditorSoon,
  } = props

  // editor.margin 插槽上下文：与 ContextDock 同一 PanelContext 口径
  const editorMarginContext: PanelContext = {
    activeFileId: openFiles.length > 0 ? activeFileId : '',
    hasWorkspace: workspace !== null,
  }

  // ContextDock 瞬时隐藏（窄窗口互斥）：副本改 visibility，不写回持久化状态
  const dockRenderState = contextDockVisible === false && contextDockState.visibility !== 'hidden'
    ? { ...contextDockState, visibility: 'hidden' as const }
    : contextDockState

  return (
    <div className="workspace" ref={editorAreaRef} style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}>
      {scrimProps && <div {...scrimProps} />}
      <Sidebar
        collapsed={sidebarCollapsed}
        searchShortcut={searchShortcut}
        demoTree={DEMO_TREE}
        demoFileNames={demoFileNames}
        workspace={workspace}
        openFiles={openFiles}
        activeFileId={activeFileId}
        onSelectDemoFile={onSelectDemoFile}
        onSelectWorkspaceFile={onSelectWorkspaceFile}
        onCreateFile={onCreateFile}
        onRenameFile={onRenameFile}
        onDeleteFile={onDeleteFile}
        onMoveFile={onMoveFile}
        onOpenInNewWindow={onOpenInNewWindow}
        initialCollapsedKeys={currentCollapsedKeys}
        onCollapsedKeysChange={onCollapsedKeysChange}
        collapseFoldersOnOpen={collapseFoldersOnOpen}
        onOpenSearch={onOpenSearch}
        recentFiles={recentFiles}
        favorites={favorites}
        onToggleFavorite={onToggleFavorite}
        onOpenSettings={onOpenSettings}
      />
      <button
        type="button"
        className={`sidebar-toggle ${sidebarCollapsed ? 'flipped' : ''}`}
        onClick={(e) => onToggleSidebar(e.currentTarget)}
        aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        aria-pressed={!sidebarCollapsed}
        aria-controls="workspace-file-sidebar"
        title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
      >
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
      </button>
      {!sidebarCollapsed && <div className="sidebar-resizer" onMouseDown={onStartSidebarResize} />}
      {searchMode !== 'none' && (
        <SearchBar
          key={searchEpoch}
          withReplace={searchMode === 'replace'}
          onClose={onCloseSearch}
          count={searchCount}
          current={searchCurrent}
          initial={searchPref}
          onQueryChange={searchHandlers.onQueryChange}
          onNext={searchHandlers.onNext}
          onReplace={searchHandlers.onReplace}
          onReplaceAll={searchHandlers.onReplaceAll}
          onReplacementChange={searchHandlers.onReplacementChange}
        />
      )}
      <div className="editor-host">
        {/* 轻路径条（NEXT-UI-SPEC §3.3）：正文滚动区上方 28px，表达「当前文件在哪里」 */}
        {openFiles.length > 0 && activePathKind && (
          <DocumentPathbar
            title={openFiles.find((f) => f.id === activeFileId)?.name ?? ''}
            kind={activePathKind}
            path={activeFilePath ?? null}
            workspacePath={workspace?.path ?? null}
            onRevealInSidebar={onRevealActiveFile}
          />
        )}
        {/* 跳转链接落点：tabIndex=-1 让锚点能真正把焦点移进来（否则焦点仍留在链接上） */}
        <div className="editor-content" id={SKIP_LINK_TARGET_ID} tabIndex={-1}>
          <Editor
            ref={editorRef}
            initialContent={DEMO_FILES[DEFAULT_FILE_ID].content}
            onChange={onEditorChange}
            onCursorChange={onCursorChange}
            onRichRender={onRichRender}
            blankClickToEnd={blankClickToEnd}
            codeLineNumbers={codeLineNumbers}
            onNotify={onNotify}
            wikiLinkFiles={wikiLinkFiles}
            onWikiLinkClick={onWikiLinkClick}
            wikiResolveTest={wikiResolveTest}
            onFullscreenChange={onFullscreenChange}
            imageHints={imageHints as never}
          />
          {graphTabOpen && (
            <GraphView
              active={graphTabActive}
              graph={linkGraph as never}
              activePath={activeFilePath ?? null}
              workspaceName={workspace?.name ?? ''}
              truncated={linksTruncated}
              settings={graphSettings}
              onSettingsChange={onGraphSettingsChange}
              workspaceIndex={workspaceIndex}
              onClose={() => { onGraphTabClose(); focusEditorSoon() }}
              onOpenNode={onGraphOpenNode}
              onGhostClick={(target) => onNotify(`链接目标未创建：${target}`)}
            />
          )}
          {previewMode && (
            <div className="preview-pane" ref={previewPaneRef}>
              <div className="editor-inner preview-content" ref={previewContentRef} />
            </div>
          )}
          <EditorMargin context={editorMarginContext} />
          {openFiles.length === 0 && (
            <StartScreen onNew={onNew} onOpen={onOpen} onOpenFolder={onOpenFolder} hasWorkspace={workspace !== null} />
          )}
        </div>
      </div>
      <ContextDock
        state={dockRenderState}
        onStateChange={onContextDockStateChange}
        hasWorkspace={workspace !== null}
        hasActiveDocument={openFiles.length > 0}
        content={activeContent}
        activeFileId={activeFileId}
        activeOutlineIndex={activeOutlineIndex}
        onOutlineClick={onOutlineClick}
        linkGraph={linkGraph as never}
        workspaceIndex={workspaceIndex}
        sidebarViewModel={sidebarViewModel as never}
        activeLinkPath={activeFilePath ?? null}
        linksLoading={linksLoading}
        linksTruncated={linksTruncated}
        onOpenLink={onOpenLink}
        onUnresolvedLinkClick={(target) => onNotify(`链接目标未创建：${target}`)}
        onOpenGraphView={onOpenGraphView}
        tagsFiles={tagIndex?.files ?? null}
        tagsLoading={tagsLoading}
        tagsTruncated={tagsTruncated}
        tagFilter={tagFilter}
        onToggleTagFilter={onToggleTagFilter}
        onOpenWorkspaceFile={onSelectWorkspaceFile}
        diagnostics={diagnostics}
        indexLoading={indexLoading}
        onRefreshIndex={onRefreshIndex}
        onCancelIndex={onCancelIndex}
        onOpenDiagnostic={onOpenDiagnostic}
        typographyIssues={typographyIssues}
        onOpenTypographyIssue={onOpenTypographyIssue}
        onFixTypography={onFixTypography}
        properties={activeProperties as never}
        showProperties={showFrontmatterProps}
        onToggleProperties={onToggleProperties}
        onUpdateProperty={onUpdateProperty}
        onDeleteProperty={onDeleteProperty}
        onAddProperty={onAddProperty}
      />
    </div>
  )
}
