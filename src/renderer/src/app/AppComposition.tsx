import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { EditorHandle } from '../components/Editor'
import type { WritingStats } from '../components/HelpDialog'
import { StatusBar } from '../components/StatusBar'
import { WorkspaceShell } from '../components/WorkspaceShell'
import { SkipLink } from './SkipLink'
import { buildSidebarViewModel } from '../components/Sidebar/sidebar-view-model'
import { flushPersistedSettings } from '../hooks/usePersistedSetting'
import { setConfirmDialogListener } from '../lib/confirm-dialog'
import type { ActiveConfirmRequest } from '../components/ConfirmDialog'
import { useExports } from '../hooks/useExports'
import { usePreviewSync } from '../hooks/usePreviewSync'
import { useTypewriterMode } from '../hooks/useTypewriterMode'
import { useRecentFiles } from '../hooks/useRecentFiles'
import { useEditorViewState } from '../hooks/useEditorViewState'
import { useSystemFileOpen } from '../hooks/useSystemFileOpen'
import { useDocumentSessionPersistence } from '../hooks/useDocumentSessionPersistence'
import {
  createDocumentFromTemplate,
} from '../lib/document-collection'
import type { PublishOptions, PublishScope } from '../lib/export-bundle'
import { normalizeWorkspaceRelativePath } from '../../../shared/workspace-state'
import { resolveCollectionEntries } from './resolve-collection-entries'

import { useDocumentSession } from './document-session/useDocumentSession'
import { classifyDocumentSource } from './document-session/document-source'
import { useAppActions } from './useAppActions'
import { createCommandContext } from './commands/command-context'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import { useWorkspaceState } from './useWorkspaceState'
import { useWorkspaceController } from './workspace/useWorkspaceController'
import type { DocumentWorkspaceBridge } from './workspace/types'
import { useWorkspaceLayoutPersistence } from './workspace/useWorkspaceLayoutPersistence'
import { useEditorSearch } from './useEditorSearch'

import { useAppSettings } from './useAppSettings'
import { useSidebarFavorites } from './useSidebarFavorites'
import { useMarkdownDrop } from './useMarkdownDrop'
import { useWorkspaceIndexes } from './useWorkspaceIndexes'
import { useEditorFeatures } from './useEditorFeatures'
import { useGraphView } from './useGraphView'
import { useAppLayout } from './useAppLayout'
import { useWritingMetrics } from './useWritingMetrics'
import { AppWorkspace } from './AppWorkspace'
import { AppDialogs } from './AppDialogs'
import { AppTopBarHost } from './TopBarSlots'

import { DEMO_FILES } from '../data/demo-files'
import { DEMO_FILE_IDS, FRESH_MODE, TITLEBAR_COLORS } from './constants'

// ---------------------------------------------------------------------------
// AppComposition — 应用编排根组件
//
// 职责：装配各功能域 hook，传递最小必要接口，渲染视图组合。
// 不包含：业务逻辑实现、设置持久化、索引管理、编辑器增强、统计计算。
// ---------------------------------------------------------------------------

export function AppComposition(): JSX.Element {
  const editorRef = useRef<EditorHandle>(null)
  const editorAreaRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)

  // === 视图状态 ===
  const {
    theme, setTheme, sidebarCollapsed, setSidebarCollapsed,
    focusMode, setFocusMode, typewriter, setTypewriter,
    previewMode, setPreviewMode, settingsOpen, setSettingsOpen,
    helpView, setHelpView, imagesOpen, setImagesOpen,
    autosave, setAutosave, spellcheck, setSpellcheck,
    multiWindow, setMultiWindow, fontSize, setFontSize,
    contentWidth, setContentWidth, lineHeight, setLineHeight,
    contentFont, setContentFont,
  } = useEditorViewState()

  const [, setFocusOutlineTick] = useState(0)
  const [pdfOptsOpen, setPdfOptsOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  const [wsSearchOpen, setWsSearchOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  const [confirmRequest, setConfirmRequest] = useState<ActiveConfirmRequest | null>(null)
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1, heading: '', headingIndex: -1, selected: 0 })

  // === 工作区状态 ===
  const {
    workspace, setWorkspace, workspaceSettings, setWorkspaceSettings,
    setWorkspaceDocuments, workspaceCollapsedKeys, setWorkspaceCollapsedKeys,
    workspaceStateReady, setWorkspaceStateReady, workspacePathRef,
    workspaceDocumentsRef, currentCollapsedKeys, effectiveTheme,
    setSidebarCollapsedKeys, sidebarActiveTab, setSidebarActiveTab,
    contextDockState, setContextDockState, handleThemeChange,
    handleWorkspaceThemeEnabledChange, handleCollapsedKeysChange,
    toast, setToast,
  } = useWorkspaceState({ theme, setTheme, settingsReady: false })

  // === 搜索 ===
  const { searchMode, setSearchMode, searchCount, setSearchCount, searchCurrent, setSearchCurrent, searchPref, setSearchPref, searchEpoch, setSearchEpoch, closeSearch: resetSearchState, handlers: searchHandlers } = useEditorSearch({ editorRef })

  // === 布局 ===
  const modalOpenRef = useRef(false)
  const fullscreenOpenRef = useRef(false)
  modalOpenRef.current = settingsOpen || helpView !== null || imagesOpen || pdfOptsOpen || publishOpen || wsSearchOpen || paletteOpen || versionHistoryOpen || confirmRequest !== null

  const { sidebarWidth, setSidebarWidth, startSidebarResize, zoom, setZoom } = useAppLayout({
    modalOpenRef, fullscreenOpenRef, focusMode, setFocusMode, searchMode,
  })

  // === 文档会话 ===
  const { recentFiles, setRecentFiles, recordRecent } = useRecentFiles(false)
  const {
    activeContent, activeFile, activeFileId, activeFileIdRef, clearDraft,
    contents, contentsRef, dirOfFile, docTitle, draftPendingRef, documents,
    encodingMap, fileMtime, flushEditorContent, focusEditorSoon,
    handleCloseAllTabs, handleCloseOtherTabs, handleCloseTab, handleEditorChange,
    handleNew, handleOpen, handleOpenFolder, handleReorderTabs, handleSave,
    handleSaveAs, handleSelectDemoFile, handleSelectWorkspaceFile,
    handleTogglePinnedTab, INITIAL_OR_SAVED, liveContentOf, openFiles,
    openFilesRef, replaceEditorContent, restoreFromSessionData, saved, savedMap,
    setActiveFileId, setContents, setDocTitle, setEncodingMap, setFileMtime,
    setOpenFiles, setSavedMap, switchFile, saveWithEncodingFallback,
  } = useDocumentSession({
    editorRef, titleRef, settingsReady: false, autosave, setToast,
    recordRecent, workspacePathRef, workspaceDocumentsRef, setWorkspace,
    setWorkspaceStateReady, setWorkspaceSettings, setWorkspaceDocuments,
    setWorkspaceCollapsedKeys, setSidebarWidth, setSidebarActiveTab,
    setContextDockState, setSearchCount, setSearchCurrent, setSearchMode,
  })

  // === 设置 ===
  // 设置加载流程在 useWritingMetrics 之前装配，历史统计要灌入后者的 state；
  // 用 ref 镜像打通，避免为了调用顺序而拆散设置的批量加载
  const setWritingStatsRef = useRef<Dispatch<SetStateAction<WritingStats>>>(() => {})
  const settings = useAppSettings({
    setTheme, setAutosave, setSpellcheck, setMultiWindow, setFontSize,
    setContentWidth, setLineHeight, setContentFont, setZoom, setSidebarWidth,
    setSidebarActiveTab, setContextDockState, setSidebarCollapsedKeys,
    setSearchPref, setRecentFiles, setWritingStats: (value) => setWritingStatsRef.current(value),
    restoreFromSessionData, setToast,
    theme, autosave, spellcheck, multiWindow, fontSize, contentWidth,
    lineHeight, contentFont, zoom, sidebarWidth,
  })
  const { settingsReady } = settings

  // === 工作区索引 ===
  const {
    workspaceIndex, indexLoading, diagnostics, linkGraph, linksLoading,
    linksTruncated, refreshLinks, tagIndex, tagsLoading, tagsTruncated,
    refreshIndex, cancelIndex,
  } = useWorkspaceIndexes({ workspace, setToast, fileMtime })

  // === 图谱 ===
  const { graphTabOpen, graphTabActive, setGraphTabActive, openGraphView, closeGraphView } = useGraphView({ workspace, refreshLinks, setToast })

  // === 编辑器增强 ===
  const {
    typographyIssues, handleOpenTypographyIssue, handleFixTypography,
    activeProperties, handleUpdateProperty, handleDeleteProperty, handleAddProperty,
    handleOutlineClick, wikiLinkFileList, handleWikiLinkClick, wikiResolveTest,
  } = useEditorFeatures({
    editorRef, editorAreaRef, activeFileId, activeContent,
    deferredContent: activeContent, activeFilePath: activeFile?.path,
    workspace, liveContentOf, replaceEditorContent, setToast, handleSelectWorkspaceFile,
  })

  // === 写作统计 ===
  const {
    wordCount, lineCount, readTime, effectiveGoal, goalPercent,
    handleGoalChange, writingStats, setWritingStats, sectionStatsForIndex,
  } = useWritingMetrics({
    activeFileId, activeContent, settingsReady,
    wordGoal: settings.wordGoal, wordGoalOverrides: settings.wordGoalOverrides,
    setWordGoalOverrides: settings.setWordGoalOverrides, activeFileIdRef,
  })
  setWritingStatsRef.current = setWritingStats

  // === 可用标签 ===
  const availableTags = useMemo(() => {
    if (!workspaceIndex) return []
    const names = new Set<string>()
    for (const doc of Object.values(workspaceIndex.documents)) for (const tag of doc.tags) names.add(tag)
    return Array.from(names).sort((a, b) => a.localeCompare(b)).slice(0, 200)
  }, [workspaceIndex])

  // === 工作区文件操作 ===
  const workspaceFilesBridge = useMemo<DocumentWorkspaceBridge>(() => ({
    openDocumentPath: handleSelectWorkspaceFile, openFolder: handleOpenFolder,
    liveContentOf, saveWithEncodingFallback, flushEditorContent, replaceEditorContent,
    switchFile, clearDraft, openFilesRef, contentsRef, activeFileIdRef,
    initialOrSavedRef: INITIAL_OR_SAVED, draftPendingRef, setOpenFiles, setContents,
    setSavedMap, setFileMtime, setEncodingMap, setActiveFileId, setDocTitle,
  }), [INITIAL_OR_SAVED, activeFileIdRef, clearDraft, contentsRef, draftPendingRef, flushEditorContent, handleOpenFolder, handleSelectWorkspaceFile, liveContentOf, openFilesRef, replaceEditorContent, saveWithEncodingFallback, setActiveFileId, setContents, setDocTitle, setEncodingMap, setFileMtime, setOpenFiles, setSavedMap, switchFile])

  const { createFile: handleCreateFile, renameFile: handleRenameFile, moveFile: handleMoveFile, deleteFile: handleDeleteFile, openInNewWindow: handleOpenInNewWindow } = useWorkspaceController({
    workspace, openFiles, savedMap, fileMtime, bridge: workspaceFilesBridge, setToast, closeAllTabs: handleCloseAllTabs,
  })

  // === 导出 ===
  const demoFileNames = useMemo(() => Object.fromEntries(Object.values(DEMO_FILES).map((f) => [f.id, f.name])), [])
  const handleNewFromTemplate = useCallback((template: 'readme' | 'api' | 'design' | 'changelog') => {
    const content = createDocumentFromTemplate(template, {})
    handleNew()
    const newId = activeFileIdRef.current
    if (!newId) return
    setContents((prev) => ({ ...prev, [newId]: content }))
    setSavedMap((prev) => ({ ...prev, [newId]: false }))
    editorRef.current?.replaceContent(content)
  }, [activeFileIdRef, editorRef, handleNew, setContents, setSavedMap])

  const resolveCollectionEntriesFn = useCallback(async (scope: Exclude<PublishScope, { kind: 'document' }>) => {
    if (!window.desktopAPI) throw new Error('当前环境不支持集合导出')
    return resolveCollectionEntries(scope, {
      workspaceIndex,
      activePath: documents[activeFileIdRef.current]?.path ?? '',
      readDocument: (path) => window.desktopAPI.document.read(path),
    })
  }, [activeFileIdRef, documents, workspaceIndex])

  const { handleExportHtml, handleDoExportPdf, handleExportMarkdown, handleExportPandoc, handleExportDocx, handlePublishBundle, handleCopyRichText, isExportActive } = useExports({
    editorRef, docTitle, activeFileId, activeFileIdRef, contents, dirOfFile, setToast, exportCss: settings.exportCss, resolveCollectionEntries: resolveCollectionEntriesFn,
  })

  const { previewContentRef, previewPaneRef, handleRichRender } = usePreviewSync({ previewMode, activeContent, editorRef, editorAreaRef, isExportActive })
  const { centerCaret } = useTypewriterMode({ typewriter, editorAreaRef })

  // === 动作分发 ===
  const handleFullscreenChange = useCallback((open: boolean) => { fullscreenOpenRef.current = open }, [])
  const { handleAction, handleDocumentTitleBlur, handleDocumentTitleKeyDown, handleOpenBacklink, handleOpenGraphView, reveal, closeSettings, closeHelp, closeImages, closePdfOptions, closePublish, closeWorkspaceSearch, closePalette, closeVersionHistory, commandRegistry } = useAppActions({
    editorRef, docTitle, setDocTitle, activeFileId, activeFileIdRef, openFiles, openFilesRef, setOpenFiles, demoFileNames, activeFilePath: activeFile?.path, workspacePathRef, focusEditorSoon, setToast,
    handleNew, handleOpen, handleOpenFolder, handleSelectWorkspaceFile, handleSave, handleSaveAs, handleCloseTab, handleCloseOtherTabs, handleCloseAllTabs, handleRenameFile,
    handleExportHtml, handleExportMarkdown, handleExportPandoc, handleExportDocx,
    setSearchMode, setFocusOutlineTick, setSidebarActiveTab, setContextDockState, setSearchPref, setSearchEpoch, setSidebarCollapsed, setFocusMode, setPreviewMode, setTypewriter, setZoom, centerCaret,
    setSettingsOpen, setHelpView, setImagesOpen, setPdfOptsOpen, setPublishOpen, handleNewFromTemplate, setWsSearchOpen, setPaletteOpen, setVersionHistoryOpen, openGraphView,
    getHasUnsavedChanges: () => Object.values(documents).some((d) => d.dirty),
    getLayoutState: () => ({ activeView: sidebarActiveTab, sidebarWidth, typewriterMode: typewriter }),
    setSidebarWidth,
  })

  // === 全局快捷键 ===
  const shortcutLookupRef = useRef<Record<string, string>>({})
  useEffect(() => {
    const lookup: Record<string, string> = {}
    for (const [action, combo] of Object.entries(settings.shortcuts)) { if (combo) lookup[combo] = action }
    shortcutLookupRef.current = lookup
  }, [settings.shortcuts])
  // 快捷键与菜单/命令面板共享同一分发入口（handleAction 内部走命令注册表）
  useGlobalShortcuts({
    shortcutLookupRef, modalOpenRef, fullscreenOpenRef, dispatchAction: handleAction,
  })

  // === 副作用 ===
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
    const colors = TITLEBAR_COLORS[effectiveTheme] ?? TITLEBAR_COLORS.default
    window.desktopAPI?.window.setTitlebarColor(colors.bg, colors.symbol).catch(() => {})
  }, [effectiveTheme])
  useEffect(() => { document.documentElement.style.setProperty('--efs', `${fontSize}px`) }, [fontSize])
  useEffect(() => { document.documentElement.style.setProperty('--ecw', `${contentWidth}px`) }, [contentWidth])
  useEffect(() => { document.documentElement.style.setProperty('--elh', String(lineHeight)) }, [lineHeight])
  useEffect(() => { document.documentElement.setAttribute('data-contentfont', contentFont) }, [contentFont])
  useEffect(() => { document.title = `${saved ? '' : '● '}${docTitle} — MarkdownSoft` }, [docTitle, saved])
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (Object.values(documents).some((d) => d.dirty)) { e.preventDefault(); e.returnValue = '' }; flushPersistedSettings() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [documents])
  useEffect(() => { setConfirmDialogListener((request, resolve) => setConfirmRequest({ ...request, resolve })); return () => setConfirmDialogListener(null) }, [])
  useEffect(() => { const w = window as unknown as { __markdownsoft_notify?: (m: string) => void }; w.__markdownsoft_notify = (m) => setToast(m); return () => { delete w.__markdownsoft_notify } }, [setToast])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t) }, [toast, setToast])

  useSystemFileOpen(handleSelectWorkspaceFile, settingsReady)
  useDocumentSessionPersistence({ activeFileId, demoFileIds: DEMO_FILE_IDS, freshMode: FRESH_MODE, openFiles, ready: settingsReady, workspace })
  useWorkspaceLayoutPersistence({ workspace, workspaceStateReady, collapsedKeys: workspaceCollapsedKeys, openFiles, activeFileId, sidebarWidth, sidebarActiveView: sidebarActiveTab, contextDock: contextDockState, setToast })

  // === 标签筛选 ===
  const [tagFilter, setTagFilter] = useState<{ tag: string; paths: string[] } | null>(null)
  useEffect(() => { setTagFilter(null) }, [workspace?.path])
  const handleToggleTagFilter = useCallback((tag: string) => {
    setTagFilter((prev) => {
      if (prev && prev.tag.toLowerCase() === tag.toLowerCase()) return null
      const paths = (tagIndex?.files ?? []).filter((f) => f.tags.some((t) => t.toLowerCase() === tag.toLowerCase())).map((f) => f.path)
      return paths.length > 0 ? { tag, paths } : null
    })
  }, [tagIndex])

  const closeSearch = useCallback(() => { resetSearchState(); focusEditorSoon() }, [resetSearchState, focusEditorSoon])

  // 窗口级 Markdown 拖放（抽出后 AppComposition 只保留一行装配）
  const markdownDrop = useMarkdownDrop({
    onOpenFile: (path) => void handleSelectWorkspaceFile(path),
    notify: setToast,
  })

  // === 侧栏收藏（quiet-workspace 快捷导航） ===
  const { favorites, toggleFavorite: handleToggleFavorite } = useSidebarFavorites({
    workspacePath: workspace?.path,
    settingsReady,
  })
  const imageDirs = useMemo(() => {
    const dirs: string[] = []
    if (activeFile?.path) dirs.push(`${activeFile.path.replace(/[\\/][^\\/]+$/, '')}/attachments`)
    if (workspace) dirs.push(`${workspace.path}/attachments`)
    return dirs
  }, [activeFile?.path, workspace])
  const contextDockViewModel = useMemo(() => workspaceIndex ? buildSidebarViewModel(workspaceIndex, activeFile?.path ?? null, 'links') : null, [activeFile?.path, workspaceIndex])
  const currentFileSource = classifyDocumentSource(activeFile?.path, workspace?.path, window.desktopAPI?.platform === 'win32')

  const handleCursorChange = useCallback((line: number, col: number, heading: string, headingIndex: number, selected: number) => {
    setCursorPos((prev) => prev.line === line && prev.col === col && prev.heading === heading && prev.headingIndex === headingIndex && prev.selected === selected ? prev : { line, col, heading, headingIndex, selected })
  }, [])

  // === 渲染 ===
  return (
    <div
      className={`app ${focusMode ? 'focus-mode' : ''} ${typewriter ? 'typewriter-mode' : ''}`}
      {...markdownDrop}
    >
      <SkipLink />
      <AppTopBarHost
        sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        focusMode={focusMode} onToggleFocusMode={() => setFocusMode((v) => !v)}
        settingsOpen={settingsOpen} onOpenSettings={() => setSettingsOpen(true)}
        effectiveTheme={effectiveTheme} onThemeChange={handleThemeChange}
        onAction={handleAction} recentFiles={recentFiles} shortcuts={settings.shortcuts}
        docTitle={docTitle} titleRef={titleRef}
        onTitleBlur={handleDocumentTitleBlur} onTitleKeyDown={handleDocumentTitleKeyDown}
        workspaceName={workspace?.name ?? '未打开知识库'} workspacePath={workspace?.path}
        openFiles={openFiles} activeFileId={activeFileId} savedMap={savedMap}
        onSwitchFile={(id) => { setGraphTabActive(false); switchFile(id) }}
        onCloseTab={handleCloseTab} onCloseOtherTabs={handleCloseOtherTabs} onCloseAllTabs={handleCloseAllTabs}
        onTogglePinnedTab={handleTogglePinnedTab} onReorderTabs={handleReorderTabs}
        graphTabOpen={graphTabOpen} graphTabActive={graphTabActive}
        onActivateGraphTab={() => setGraphTabActive(true)} onCloseGraphTab={closeGraphView}
        filePath={activeFile?.path} fileSource={currentFileSource} fileDirty={!saved}
      />

      <WorkspaceShell workspacePath={workspace?.path}>
        <AppWorkspace
          editorAreaRef={editorAreaRef} sidebarWidth={sidebarWidth} sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)} onStartSidebarResize={startSidebarResize}
          searchMode={searchMode} searchEpoch={searchEpoch} searchCount={searchCount} searchCurrent={searchCurrent}
          searchPref={searchPref} searchHandlers={searchHandlers} onCloseSearch={closeSearch}
          openFiles={openFiles} activeFileId={activeFileId} activeFilePath={activeFile?.path}
          activeContent={activeContent}
          workspace={workspace} demoFileNames={demoFileNames}
          currentCollapsedKeys={currentCollapsedKeys} onCollapsedKeysChange={handleCollapsedKeysChange} collapseFoldersOnOpen={settings.collapseFoldersOnOpen}
          onOpenSearch={() => setPaletteOpen(true)} recentFiles={recentFiles}
          favorites={favorites} onToggleFavorite={handleToggleFavorite}
          onOpenSettings={() => setSettingsOpen(true)}
          onSelectDemoFile={handleSelectDemoFile} onSelectWorkspaceFile={(p, pinned) => void handleSelectWorkspaceFile(p, pinned)}
          onCreateFile={(dir) => void handleCreateFile(dir)} onRenameFile={(p, n) => void handleRenameFile(p, n)}
          onDeleteFile={(p) => void handleDeleteFile(p)} onMoveFile={(p, d) => void handleMoveFile(p, d)} onOpenInNewWindow={handleOpenInNewWindow}
          graphTabOpen={graphTabOpen} graphTabActive={graphTabActive} onGraphTabClose={closeGraphView}
          onGraphOpenNode={(path) => { setGraphTabActive(false); void reveal({ path }) }}
          linkGraph={linkGraph} linksTruncated={linksTruncated} graphSettings={settings.graphSettings} onGraphSettingsChange={settings.setGraphSettings}
          editorRef={editorRef} onEditorChange={handleEditorChange} onCursorChange={handleCursorChange}
          onRichRender={handleRichRender} blankClickToEnd={settings.blankClickToEnd} codeLineNumbers={settings.codeLineNumbers}
          onNotify={setToast} wikiLinkFiles={wikiLinkFileList} onWikiLinkClick={handleWikiLinkClick}
          wikiResolveTest={wikiResolveTest} onFullscreenChange={handleFullscreenChange}
          imageHints={{ documentId: activeFileId, docPath: activeFile?.path, workspacePath: workspace?.path, workspaceAttachmentDirectory: workspace ? workspaceSettings.editor.attachmentDirectory : null, globalAttachmentDirectory: settings.globalAttachmentDirectory, imageHost: settings.imageHost }}
          previewMode={previewMode} previewPaneRef={previewPaneRef} previewContentRef={previewContentRef}
          onNew={handleNew} onOpen={() => void handleOpen()} onOpenFolder={() => void handleOpenFolder()}
          contextDockState={contextDockState} onContextDockStateChange={setContextDockState}
          workspaceIndex={workspaceIndex} indexLoading={indexLoading} diagnostics={diagnostics}
          onRefreshIndex={refreshIndex} onCancelIndex={cancelIndex}
          onOpenDiagnostic={(d) => { if (d.path) void reveal({ path: d.path, focusLine: d.line }) }}
          sidebarViewModel={contextDockViewModel} linksLoading={linksLoading}
          onOpenLink={handleOpenBacklink} onOpenGraphView={handleOpenGraphView}
          tagIndex={tagIndex} tagsLoading={tagsLoading} tagsTruncated={tagsTruncated}
          tagFilter={tagFilter} onToggleTagFilter={handleToggleTagFilter}
          typographyIssues={typographyIssues} onOpenTypographyIssue={handleOpenTypographyIssue} onFixTypography={handleFixTypography}
          activeProperties={activeProperties} showFrontmatterProps={settings.showFrontmatterProps}
          onToggleProperties={() => settings.setShowFrontmatterProps((v) => !v)}
          onUpdateProperty={handleUpdateProperty} onDeleteProperty={handleDeleteProperty} onAddProperty={handleAddProperty}
          activeOutlineIndex={cursorPos.headingIndex} onOutlineClick={handleOutlineClick} focusEditorSoon={focusEditorSoon}
        />
      </WorkspaceShell>

      <StatusBar
        saved={saved} wordCount={wordCount} lineCount={lineCount} readTime={readTime}
        cursorLine={cursorPos.line} cursorCol={cursorPos.col} currentHeading={cursorPos.heading}
        modifiedTime={fileMtime[activeFileId]} selectedChars={cursorPos.selected}
        encoding={encodingMap[activeFileId] ?? 'UTF-8'} sectionWords={sectionStatsForIndex(cursorPos.headingIndex)}
        goalWords={effectiveGoal} goalPercent={goalPercent} onGoalChange={handleGoalChange}
      />

      <AppDialogs
        settingsOpen={settingsOpen} onCloseSettings={closeSettings}
        effectiveTheme={effectiveTheme} onThemeChange={handleThemeChange}
        workspace={workspace} workspaceSettings={workspaceSettings}
        onWorkspaceThemeEnabledChange={handleWorkspaceThemeEnabledChange}
        fontSize={fontSize} onFontSizeChange={setFontSize}
        contentWidth={contentWidth} onContentWidthChange={setContentWidth}
        lineHeight={lineHeight} onLineHeightChange={setLineHeight}
        contentFont={contentFont} onContentFontChange={setContentFont}
        zoom={zoom} onZoomChange={setZoom} autosave={autosave} onAutosaveChange={setAutosave}
        typewriter={typewriter} onTypewriterChange={setTypewriter}
        spellcheck={spellcheck} onSpellcheckChange={setSpellcheck}
        spellcheckLang={settings.spellcheckLang} onSpellcheckLangChange={settings.setSpellcheckLang}
        multiWindow={multiWindow} onMultiWindowChange={setMultiWindow}
        blankClickToEnd={settings.blankClickToEnd} onBlankClickToEndChange={settings.setBlankClickToEnd}
        codeLineNumbers={settings.codeLineNumbers} onCodeLineNumbersChange={settings.setCodeLineNumbers}
        collapseFoldersOnOpen={settings.collapseFoldersOnOpen} onCollapseFoldersOnOpenChange={settings.setCollapseFoldersOnOpen}
        wordGoal={settings.wordGoal} onWordGoalChange={settings.setWordGoal}
        customCssName={settings.customCss?.name ?? null} onImportCss={() => void settings.handleImportCss()} onRemoveCss={settings.handleRemoveCss}
        exportCssName={settings.exportCss?.name ?? null} onImportExportCss={() => void settings.handleImportExportCss()} onRemoveExportCss={settings.handleRemoveExportCss}
        imageHost={settings.imageHost} onImageHostProviderChange={settings.handleImageHostProviderChange} onImageHostTokenSave={settings.handleImageHostTokenSave}
        globalAttachmentDirectory={settings.globalAttachmentDirectory}
        onGlobalAttachmentDirectoryChange={(value) => {
          const normalized = value.trim() ? normalizeWorkspaceRelativePath(value) : null
          if (value.trim() && !normalized) { setToast('附件目录必须是工作区内的相对路径'); return }
          settings.setGlobalAttachmentDirectory(normalized ?? 'attachments')
        }}
        workspaceAttachmentDirectory={workspaceSettings.editor.attachmentDirectory}
        onWorkspaceAttachmentDirectoryChange={(value) => {
          const normalized = value?.trim() ? normalizeWorkspaceRelativePath(value) : null
          if (value?.trim() && !normalized) { setToast('附件目录必须是工作区内的相对路径'); return }
          setWorkspaceSettings((c) => ({ ...c, editor: { attachmentDirectory: normalized } }))
        }}
        shortcuts={settings.shortcuts} onShortcutsChange={settings.setShortcuts}
        helpView={helpView} onCloseHelp={closeHelp} writingStats={writingStats}
        imagesOpen={imagesOpen} onCloseImages={closeImages} imageDirs={imageDirs} setToast={setToast}
        pdfOptsOpen={pdfOptsOpen} onClosePdfOptions={closePdfOptions}
        onExportPdf={(opts) => { setPdfOptsOpen(false); void handleDoExportPdf(opts) }}
        publishOpen={publishOpen} publishBusy={publishBusy} availableTags={availableTags} onClosePublish={closePublish}
        onExportBundle={(opts: PublishOptions, scope: PublishScope) => { setPublishOpen(false); setPublishBusy(true); void handlePublishBundle(opts, scope).finally(() => setPublishBusy(false)) }}
        onCopyRichText={(opts: PublishOptions) => { setPublishOpen(false); setPublishBusy(true); void handleCopyRichText(opts).finally(() => setPublishBusy(false)) }}
        paletteOpen={paletteOpen} onClosePalette={closePalette} recentFiles={recentFiles}
        onSelectWorkspaceFile={(path, pinned) => void handleSelectWorkspaceFile(path, pinned)}
        onSelectDemoFile={(id, pinned) => handleSelectDemoFile(id, pinned)}
        onRunCommand={handleAction} commandRegistry={commandRegistry}
        commandContext={createCommandContext({ activeFileId, workspaceId: workspace?.path, hasWorkspace: workspace !== null, hasUnsavedChanges: Object.values(documents).some((d) => d.dirty) })}
        versionHistoryOpen={versionHistoryOpen} onCloseVersionHistory={closeVersionHistory}
        activeFilePath={activeFile?.path ?? null} activeFileName={activeFile?.name ?? ''}
        currentContent={liveContentOf(activeFileId)}
        onRestoreVersion={(content) => { setVersionHistoryOpen(false); replaceEditorContent(activeFileId, content, 'update'); setToast('已恢复历史版本到编辑器（未保存），确认后按 Ctrl+S 写入磁盘') }}
        wsSearchOpen={wsSearchOpen} onCloseWorkspaceSearch={closeWorkspaceSearch} workspaceIndex={workspaceIndex}
        onSelectSearchResult={(path, query, opts) => {
          setWsSearchOpen(false)
          void reveal({ path, search: { query, useRegex: opts?.useRegex, caseSensitive: opts?.caseSensitive } })
        }}
        confirmRequest={confirmRequest}
        onConfirmResolve={(id) => { confirmRequest?.resolve(id); setConfirmRequest(null) }}
      />

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
