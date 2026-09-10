import { useState, useCallback, useEffect, useRef, useMemo, useDeferredValue } from 'react'
import type { CSSProperties } from 'react'
import { MenuBar } from './components/MenuBar'
import type { RecentFile } from './components/MenuBar'
import { Sidebar } from './components/Sidebar'
import { ContextDock } from './components/ContextDock'
import type { ContextDockPanel } from './components/ContextDock/context-dock-state'
import { buildSidebarViewModel } from './components/Sidebar/sidebar-view-model'
import { Editor } from './components/Editor'
import type { EditorHandle } from './components/Editor'
import { StatusBar } from './components/StatusBar'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { SearchBar } from './components/SearchBar'
import { SettingsDialog } from './components/SettingsDialog'
import { HelpDialog } from './components/HelpDialog'
import type { WritingStats } from './components/HelpDialog'
import { ImagesDialog } from './components/ImagesDialog'
import { ExportPdfDialog } from './components/ExportPdfDialog'
import { GraphView } from './components/GraphView'
import { DEFAULT_GRAPH_SETTINGS } from './components/GraphView'
import type { GraphSettings } from './components/GraphView'
import { WorkspaceSearchDialog } from './components/WorkspaceSearchDialog'
import { CommandPalette } from './components/CommandPalette'
import { VersionHistoryDialog } from './components/VersionHistoryDialog'
import { TabBar } from './components/TabBar'
import { WorkspaceShell } from './components/WorkspaceShell'
import { CurrentFileBanner, type CurrentFileSource } from './components/CurrentFileBanner'
import { StartScreen } from './components/StartScreen'
import { DEFAULT_SHORTCUTS, mergeShortcuts } from './data/shortcuts'
import type { ShortcutMap } from './data/shortcuts'
import { DEMO_FILES, DEMO_TREE, DEFAULT_FILE_ID } from './data/demo-files'
import type { DraftMap } from './lib/drafts'
import { rollStatsDate, EMPTY_STATS, estimateReadMinutes } from './lib/stats'
import { isImeComposing } from './lib/keyboard'
import { flushPersistedSettings, usePersistedSetting } from './hooks/usePersistedSetting'
import { ConfirmDialog } from './components/ConfirmDialog'
import type { ActiveConfirmRequest } from './components/ConfirmDialog'
import { setConfirmDialogListener } from './lib/confirm-dialog'
import { useExports } from './hooks/useExports'
import { usePreviewSync } from './hooks/usePreviewSync'
import { useTypewriterMode } from './hooks/useTypewriterMode'
import { useWorkspaceLinks } from './hooks/useWorkspaceLinks'
import { useWorkspaceTags } from './hooks/useWorkspaceTags'
import { useWritingStats } from './hooks/useWritingStats'
import { useRecentFiles } from './hooks/useRecentFiles'
import { useEditorViewState } from './hooks/useEditorViewState'
import { useSystemFileOpen } from './hooks/useSystemFileOpen'
import {
  useDocumentSessionPersistence,
  type SessionData,
} from './hooks/useDocumentSessionPersistence'
import { resolveWikiTarget } from './lib/wiki-resolver'
import { collectMdFiles } from './lib/wiki-resolver'
import {
  getFrontmatterPropertyKeys,
  isValidFrontmatterPropertyKey,
  parseFrontmatterYaml,
  setFrontmatterProperty,
  deleteFrontmatterProperty,
  extractFrontmatterRaw,
} from './lib/frontmatter-parser'
import { PublishDialog } from './components/PublishDialog'
import type { PublishOptions } from './lib/export-bundle'
import { useDocumentSession } from './app/document-session/useDocumentSession'
import { classifyDocumentSource } from './app/document-session/document-source'
import { useAppActions } from './app/useAppActions'
import { createCommandContext } from './app/commands/command-context'
import { useGlobalShortcuts } from './app/useGlobalShortcuts'
import { useWorkspaceState } from './app/useWorkspaceState'
import { useWorkspaceController } from './app/workspace/useWorkspaceController'
import type { DocumentWorkspaceBridge } from './app/workspace/types'
import { useWorkspaceLayoutPersistence } from './app/workspace/useWorkspaceLayoutPersistence'
import { useEditorSearch } from './app/useEditorSearch'
import { extractMarkdownFiles } from './lib/drop-markdown'
import { normalizeWorkspaceRelativePath } from '../../shared/workspace-state'
import type { WorkspaceIndex, DiagnosticRecord } from '../../shared/workspace-index'
import { collectDiagnostics } from './lib/diagnostics'
import { computeSectionStats, goalProgress } from './lib/section-stats'
import { applyTypographyFixes, inspectChineseTypography } from './lib/chinese-typography'
import type { TypographyIssue } from './lib/chinese-typography'
import {
  createDocumentFromTemplate,
  extractCollectionOrder,
  extractCollectionTitle,
  type CollectionEntry,
} from './lib/document-collection'
import { toEditorImages } from './lib/image-path'
import type { PublishScope } from './lib/export-bundle'

import {
  DEMO_FILE_IDS,
  DEMO_TREE_SCOPE,
  FRESH_MODE,
  TITLEBAR_COLORS,
} from './app/constants'

export default function App(): JSX.Element {
  const editorRef = useRef<EditorHandle>(null)
  const editorAreaRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)

  const {
    theme,
    setTheme,
    sidebarCollapsed,
    setSidebarCollapsed,
    focusMode,
    setFocusMode,
    typewriter,
    setTypewriter,
    previewMode,
    setPreviewMode,
    settingsOpen,
    setSettingsOpen,
    helpView,
    setHelpView,
    imagesOpen,
    setImagesOpen,
    autosave,
    setAutosave,
    spellcheck,
    setSpellcheck,
    multiWindow,
    setMultiWindow,
    fontSize,
    setFontSize,
    contentWidth,
    setContentWidth,
    lineHeight,
    setLineHeight,
    contentFont,
    setContentFont,
  } = useEditorViewState()
  const [, setFocusOutlineTick] = useState(0)
  const [workspaceIndex, setWorkspaceIndex] = useState<WorkspaceIndex | null>(null)
  const [indexLoading, setIndexLoading] = useState(false)

  /** 编辑区缩放（0.7–1.8，Ctrl+滚轮 / Ctrl+= / Ctrl+-） */
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  zoomRef.current = zoom
  /** 侧栏宽度（可拖拽调整） */
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const sidebarWidthRef = useRef(260)
  sidebarWidthRef.current = sidebarWidth

  // 启动时加载持久化设置，并恢复会话与草稿（加载完成前不写回）
  const [settingsReady, setSettingsReady] = useState(false)

  // 字数目标：全局默认值 + 按文档 id 的覆盖值（null = 该文档明确不设目标）
  const [wordGoal, setWordGoal] = useState<number | null>(null)
  const [wordGoalOverrides, setWordGoalOverrides] = useState<Record<string, number | null>>({})

  const {
    workspace,
    setWorkspace,
    workspaceSettings,
    setWorkspaceSettings,
    setWorkspaceDocuments,
    workspaceCollapsedKeys,
    setWorkspaceCollapsedKeys,
    workspaceStateReady,
    setWorkspaceStateReady,
    workspacePathRef,
    workspaceDocumentsRef,
    currentCollapsedKeys,
    effectiveTheme,
    setSidebarCollapsedKeys,
    sidebarActiveTab,
    setSidebarActiveTab,
    contextDockState,
    setContextDockState,
    handleThemeChange,
    handleWorkspaceThemeEnabledChange,
    handleCollapsedKeysChange,
    toast,
    setToast,
  } = useWorkspaceState({ theme, setTheme, settingsReady })

  useEffect(() => {
    const api = window.desktopAPI?.workspace.index
    if (!api || !workspace?.path) {
      setWorkspaceIndex(null)
      setIndexLoading(false)
      return
    }
    let disposed = false
    setIndexLoading(true)
    api.load(workspace.path).then((result) => {
      if (disposed) return
      if (result.ok && result.data) setWorkspaceIndex(result.data)
      return api.refresh(workspace.path)
    }).then((result) => {
      if (disposed || !result) return
      if (result.ok && result.data) setWorkspaceIndex(result.data.index)
      setIndexLoading(false)
    }).catch(() => {
      if (!disposed) setIndexLoading(false)
    })
    const unsubscribe = api.onEvent((event) => {
      if (disposed) return
      if (event.type === 'updated') {
        setWorkspaceIndex(event.index)
        setIndexLoading(false)
      } else if (event.type === 'progress') {
        setIndexLoading(true)
      } else if (event.type === 'failed') {
        setIndexLoading(false)
        if (event.code !== 'CANCELLED') setToast(event.message ?? '索引扫描失败')
      }
    })
    return () => {
      disposed = true
      unsubscribe()
      void api.cancel(workspace.path)
    }
  }, [setToast, workspace?.path])

  const diagnostics = useMemo<DiagnosticRecord[]>(
    () => (workspaceIndex ? collectDiagnostics(workspaceIndex) : []),
    [workspaceIndex],
  )

  /** 光标位置（行/列 + 当前标题 + 标题索引 + 选中字数） */
  const [cursorPos, setCursorPos] = useState<{
    line: number
    col: number
    heading: string
    headingIndex: number
    selected: number
  }>({ line: 1, col: 1, heading: '', headingIndex: -1, selected: 0 })

  /** 自定义快捷键 */
  const [shortcuts, setShortcuts] = useState<ShortcutMap>({ ...DEFAULT_SHORTCUTS })
  /** 点击正文下方空白区跳到文末（U8，默认开启，可在设置关闭） */
  const [blankClickToEnd, setBlankClickToEnd] = useState(true)
  /** 代码块行号开关（装饰 widget 实现，默认关） */
  const [codeLineNumbers, setCodeLineNumbers] = useState(false)
  /** PDF 导出选项弹窗 */
  const [pdfOptsOpen, setPdfOptsOpen] = useState(false)
  /** 发布弹窗（模板 / 资源包导出 / 富文本复制） */
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishBusy, setPublishBusy] = useState(false)
  /** 自定义主题 CSS（用户导入，注入 <style> 生效） */
  const [customCss, setCustomCss] = useState<{ name: string; content: string } | null>(null)
  /** 导出模板 CSS（HTML/PDF 导出追加在默认样式之后；null = 使用默认样式） */
  const [exportCss, setExportCss] = useState<{ name: string; content: string } | null>(null)
  /** 图床状态：访问令牌仅由主进程持久化，渲染端不读取其明文。 */
  const [imageHost, setImageHost] = useState<{ provider: 'local' | 'smms'; configured: boolean }>({
    provider: 'local',
    configured: false,
  })
  const [globalAttachmentDirectory, setGlobalAttachmentDirectory] = useState('attachments')
  /** 拼写检查语言（B4 部分改善：可选 Electron 内置词典语言） */
  const [spellcheckLang, setSpellcheckLang] = useState('en-US')
  /** 工作区全文搜索弹窗 */
  const [wsSearchOpen, setWsSearchOpen] = useState(false)
  /** 命令面板（快速打开）弹窗 */
  const [paletteOpen, setPaletteOpen] = useState(false)
  /** 版本历史弹窗（当前文件的本地保存快照） */
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false)
  /** 工作区搜索结果点击序号：连续点击时只采纳最后一次，避免后发请求被先发覆盖 */
  const wsSelectSeqRef = useRef(0)
  /** 组合键 → 动作 反查表（keydown 中读 ref，避免频繁重建监听） */
  const shortcutLookupRef = useRef<Record<string, string>>({})
  /** 弹窗打开标志镜像（M4）：对话框打开期间禁用全局快捷键，
   *  避免 Ctrl+S/Ctrl+N 等在弹窗按钮聚焦时误触发（ref 镜像避免重建监听器） */
  /** 关闭前决策确认框（保存/放弃/取消）：由 useDocumentSession 经
   *  requestConfirm 发起，本组件只负责渲染与回传选择 */
  const [confirmRequest, setConfirmRequest] = useState<ActiveConfirmRequest | null>(null)
  useEffect(() => {
    setConfirmDialogListener((request, resolve) =>
      setConfirmRequest({ ...request, resolve }),
    )
    return () => setConfirmDialogListener(null)
  }, [])
  const modalOpenRef = useRef(false)
  modalOpenRef.current =
    settingsOpen ||
    helpView !== null ||
    imagesOpen ||
    pdfOptsOpen ||
    publishOpen ||
    wsSearchOpen ||
    paletteOpen ||
    versionHistoryOpen ||
    confirmRequest !== null
  /** 代码块全屏镜像（ref）：全屏 Esc 由编辑器内部监听处理，
   *  而专注模式的 window Esc 监听器注册更早、每次按键都会先触发，
   *  若不在此跳过，全屏内按 Esc 会把专注模式一并退出 */
  const fullscreenOpenRef = useRef(false)
  const handleFullscreenChange = useCallback((open: boolean) => {
    fullscreenOpenRef.current = open
  }, [])

  /* ==================== 查找替换状态（app/useEditorSearch） ==================== */

  const {
    searchMode,
    setSearchMode,
    searchCount,
    setSearchCount,
    searchCurrent,
    setSearchCurrent,
    searchPref,
    setSearchPref,
    searchEpoch,
    setSearchEpoch,
    closeSearch: resetSearchState,
    handlers: searchHandlers,
  } = useEditorSearch({ editorRef })

  // 专注模式下的 window Esc 监听器注册更早、每次按键都会先触发；
  // 全屏 Esc 由编辑器内部监听处理，若不跳过，全屏内按 Esc 会把专注模式一并退出
  useEffect(() => {
    if (!focusMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isImeComposing(event)) return
      if (event.key !== 'Escape') return
      if (searchMode !== 'none' || settingsOpen || helpView || imagesOpen || pdfOptsOpen || publishOpen || wsSearchOpen || paletteOpen || versionHistoryOpen || confirmRequest) {
        return
      }
      if (fullscreenOpenRef.current) return
      setFocusMode(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusMode, searchMode, settingsOpen, helpView, imagesOpen, pdfOptsOpen, publishOpen, wsSearchOpen, paletteOpen, versionHistoryOpen, confirmRequest, fullscreenOpenRef, setFocusMode])

  const settingsInitRef = useRef(false)

  const { recentFiles, setRecentFiles, recordRecent } = useRecentFiles(settingsReady)
  const {
    activeContent,
    activeFile,
    activeFileId,
    activeFileIdRef,
    clearDraft,
    contents,
    contentsRef,
    dirOfFile,
    docTitle,
    draftPendingRef,
    documents,
    encodingMap,
    fileMtime,
    flushEditorContent,
    focusEditorSoon,
    handleCloseAllTabs,
    handleCloseOtherTabs,
    handleCloseTab,
    handleEditorChange,
    handleNew,
    handleOpen,
    handleOpenFolder,
    handleReorderTabs,
    handleSave,
    handleSaveAs,
    handleSelectDemoFile,
    handleSelectWorkspaceFile,
    handleTogglePinnedTab,
    INITIAL_OR_SAVED,
    liveContentOf,
    openFiles,
    openFilesRef,
    replaceEditorContent,
    restoreFromSessionData,
    saveWithEncodingFallback,
    saved,
    savedMap,
    setActiveFileId,
    setContents,
    setDocTitle,
    setEncodingMap,
    setFileMtime,
    setOpenFiles,
    setSavedMap,
    switchFile,
  } = useDocumentSession({
    editorRef,
    titleRef,
    settingsReady,
    autosave,
    setToast,
    recordRecent,
    workspacePathRef,
    workspaceDocumentsRef,
    setWorkspace,
    setWorkspaceStateReady,
    setWorkspaceSettings,
    setWorkspaceDocuments,
    setWorkspaceCollapsedKeys,
    setSidebarWidth,
    setSidebarActiveTab,
    setContextDockState,
    setSearchCount,
    setSearchCurrent,
    setSearchMode,
  })

  // The preload queues early association events until settings/session restore
  // finishes, then this uses the same guarded/de-duplicating path as tree clicks.
  useSystemFileOpen(handleSelectWorkspaceFile, settingsReady)

  const contextDockViewModel = useMemo(
    () => workspaceIndex
      ? buildSidebarViewModel(workspaceIndex, activeFile?.path ?? null, 'links')
      : null,
    [activeFile?.path, workspaceIndex],
  )

  /* ==================== 领域逻辑（按职责边界拆分，App 只做编排） ==================== */

  /** 会话能力窄桥接：工作区文件操作只经此接口迁移会话记录，
   *  不直接依赖 document-session 的内部子 Hook。ref 与 setState 恒定稳定；
   *  回调由会话 useCallback 缓存，但其内部依赖变化时仍可能连带重建本 memo——
   *  只影响回调身份，不影响行为正确性。 */
  const workspaceFilesBridge = useMemo<DocumentWorkspaceBridge>(
    () => ({
      openDocumentPath: handleSelectWorkspaceFile,
      openFolder: handleOpenFolder,
      liveContentOf,
      saveWithEncodingFallback,
      flushEditorContent,
      replaceEditorContent,
      switchFile,
      clearDraft,
      openFilesRef,
      contentsRef,
      activeFileIdRef,
      initialOrSavedRef: INITIAL_OR_SAVED,
      draftPendingRef,
      setOpenFiles,
      setContents,
      setSavedMap,
      setFileMtime,
      setEncodingMap,
      setActiveFileId,
      setDocTitle,
    }),
    [
      INITIAL_OR_SAVED,
      activeFileIdRef,
      clearDraft,
      contentsRef,
      draftPendingRef,
      flushEditorContent,
      handleOpenFolder,
      handleSelectWorkspaceFile,
      liveContentOf,
      openFilesRef,
      replaceEditorContent,
      saveWithEncodingFallback,
      setActiveFileId,
      setContents,
      setDocTitle,
      setEncodingMap,
      setFileMtime,
      setOpenFiles,
      setSavedMap,
      switchFile,
    ],
  )

  /* 工作区操作统一经 WorkspaceController 边界（open/close/create/rename/
     move/delete/refresh），App 与 Sidebar 不再直接接触文件操作实现；
     open/close/refresh 由后续索引订阅与布局预设任务接线 */
  const {
    createFile: handleCreateFile,
    renameFile: handleRenameFile,
    moveFile: handleMoveFile,
    deleteFile: handleDeleteFile,
    openInNewWindow: handleOpenInNewWindow,
  } = useWorkspaceController({
    workspace,
    openFiles,
    savedMap,
    fileMtime,
    bridge: workspaceFilesBridge,
    setToast,
    closeAllTabs: handleCloseAllTabs,
  })

  /** 命令面板：从开发者模板创建新文档并自动打开（不覆盖现有文件） */
  const handleNewFromTemplate = useCallback(
    (template: 'readme' | 'api' | 'design' | 'changelog') => {
      const content = createDocumentFromTemplate(template, {})
      handleNew()
      const newId = activeFileIdRef.current
      if (!newId) return
      setContents((prev) => ({ ...prev, [newId]: content }))
      setSavedMap((prev) => ({ ...prev, [newId]: false }))
      editorRef.current?.replaceContent(content)
    },
    [activeFileIdRef, editorRef, handleNew, setContents, setSavedMap],
  )

  /** 集合发布：按范围读取文档并收集条目（读取失败以含路径的错误抛出） */
  const resolveCollectionEntries = useCallback(
    async (scope: Exclude<PublishScope, { kind: 'document' }>): Promise<CollectionEntry[]> => {
      if (!window.desktopAPI) throw new Error('当前环境不支持集合导出')
      const index = workspaceIndex
      if (!index) throw new Error('请先打开工作区后再使用集合导出')
      const activeDoc = documents[activeFileIdRef.current]
      const activePath = activeDoc?.path ?? ''
      // 目录 = 路径去掉最后一个 / 或 \ 之后的部分（Windows 与 POSIX 双兼容）
      const lastSep = Math.max(activePath.lastIndexOf('/'), activePath.lastIndexOf('\\'))
      const activeDir = lastSep > 0 ? activePath.slice(0, lastSep) : ''
      const docs = Object.values(index.documents)
      const selected = docs.filter((doc) => {
        if (scope.kind === 'tag') {
          return doc.tags.some((tag) => tag.toLowerCase() === scope.tag.toLowerCase())
        }
        // 当前目录：与活动文档同目录（根目录文档归入根目录集合）
        const docSep = Math.max(doc.path.lastIndexOf('/'), doc.path.lastIndexOf('\\'))
        const docDir = docSep > 0 ? doc.path.slice(0, docSep) : ''
        return docDir === activeDir
      })
      if (selected.length === 0) return []
      if (selected.length > 200) {
        throw new Error(`集合范围包含 ${selected.length} 篇文档（上限 200），请缩小范围`)
      }
      const entries: CollectionEntry[] = []
      for (const doc of selected) {
        const res = await window.desktopAPI.document.read(doc.path)
        const content = res.ok && typeof res.data?.content === 'string' ? res.data.content : null
        if (content == null) throw new Error(`无法读取文档：${doc.path}`)
        // 图片相对路径按源文档目录解析（读取时转 mdimg 协议）
        const imgSep = Math.max(doc.path.lastIndexOf('/'), doc.path.lastIndexOf('\\'))
        const docDir = imgSep > 0 ? doc.path.slice(0, imgSep) : undefined
        entries.push({
          path: doc.path,
          title: extractCollectionTitle(content, doc.name.replace(/\.md$/i, '')),
          order: extractCollectionOrder(content),
          content: toEditorImages(content, docDir),
        })
      }
      return entries
    },
    [activeFileIdRef, documents, workspaceIndex],
  )
  const {
    handleExportHtml,
    handleDoExportPdf,
    handleExportMarkdown,
    handleExportPandoc,
    handleExportDocx,
    handlePublishBundle,
    handleCopyRichText,
    isExportActive,
  } = useExports({
    editorRef,
    docTitle,
    activeFileId,
    activeFileIdRef,
    contents,
    dirOfFile,
    setToast,
    exportCss,
    resolveCollectionEntries,
  })

  const { previewContentRef, previewPaneRef, handleRichRender } = usePreviewSync({
    previewMode,
    activeContent,
    editorRef,
    editorAreaRef,
    isExportActive,
  })

  const { centerCaret } = useTypewriterMode({ typewriter, editorAreaRef })

  const statsSource = useMemo(
    () => ({ fileId: activeFileId, content: activeContent }),
    [activeFileId, activeContent],
  )
  const deferredStatsSource = useDeferredValue(statsSource)
  /** 统计用纯文本：剥离 frontmatter 与 Markdown 标记后仅保留可读正文 */
  const plainStatsText = useMemo(
    () =>
      deferredStatsSource.content
        .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^>\s?/gm, '')
        .replace(/^[-*+]\s+\[[ x]\]\s+/gm, '')
        .replace(/^[-*+]\s+/gm, '')
        .replace(/^\d+\.\s+/gm, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_~`|]/g, '')
        .trim(),
    [deferredStatsSource],
  )
  // 字数：非空白字符数（中文按字、英文按字母计数，与状态栏"字"口径一致）
  const wordCount = plainStatsText.replace(/\s/g, '').length
  const lineCount = plainStatsText ? plainStatsText.split('\n').length : 0
  // 阅读时长：混合估算（中文 500 字/分、拉丁词 250 词/分），英文文档不再被高估
  const readTime = estimateReadMinutes(plainStatsText)
  // 章节统计与大纲面板共用同一标题扫描口径；sections 按扁平标题序对齐
  const sectionStats = useMemo(
    () => computeSectionStats(deferredStatsSource.content),
    [deferredStatsSource],
  )
  // 工作区标签建议（集合发布"按标签"范围的输入提示）
  const availableTags = useMemo(() => {
    if (!workspaceIndex) return []
    const names = new Set<string>()
    for (const doc of Object.values(workspaceIndex.documents)) {
      for (const tag of doc.tags) names.add(tag)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b)).slice(0, 200)
  }, [workspaceIndex])
  // 中文排版检查与状态栏统计同一延后时机，不逐键全量重扫
  const typographyIssues = useMemo(
    () => inspectChineseTypography(deferredStatsSource.content),
    [deferredStatsSource],
  )
  const handleOpenTypographyIssue = useCallback((issue: TypographyIssue) => {
    editorRef.current?.focusLine(issue.line)
  }, [])
  const handleFixTypography = useCallback(() => {
    const editor = editorRef.current
    if (!editor?.isReady()) return
    const content = editor.getMarkdown()
    if (content == null) return
    const issues = inspectChineseTypography(content)
    if (issues.length === 0) {
      setToast('没有可修复的排版问题')
      return
    }
    const fixed = applyTypographyFixes(content, issues)
    // 修复结果与原文一致时不替换，避免无意义的事务与脏标记
    if (fixed === content) {
      setToast('没有可自动修复的排版问题')
      return
    }
    editor.updateContentPreservingHistory(fixed)
    setToast(`已修复 ${issues.length} 处排版问题`)
  }, [setToast])

  // 光标所在章节（headingIndex 为大纲扁平序；正文前导区/无标题文档为 -1）
  const currentSectionWords =
    cursorPos.headingIndex >= 0 ? sectionStats.sections[cursorPos.headingIndex]?.words : undefined
  // 字数目标：文档覆盖优先于全局默认；进度仅作提示，不做硬约束
  const activeGoalOverride = wordGoalOverrides[activeFileId]
  const effectiveGoal = activeGoalOverride !== undefined ? activeGoalOverride : wordGoal
  const goalPercent = goalProgress(wordCount, effectiveGoal)
  const handleGoalChange = useCallback(
    (value: number | undefined) => {
      const fileId = activeFileIdRef.current
      if (!fileId) return
      setWordGoalOverrides((prev) => {
        const next = { ...prev }
        if (value === undefined) delete next[fileId]
        else next[fileId] = value
        return next
      })
    },
    [activeFileIdRef],
  )
  const { writingStats, setWritingStats } = useWritingStats(
    wordCount,
    deferredStatsSource.fileId,
    settingsReady,
  )

  const demoFileNames = useMemo(
    () => Object.fromEntries(Object.values(DEMO_FILES).map((file) => [file.id, file.name])),
    [],
  )

  useEffect(() => {
    // 防 StrictMode 双执行：会话恢复只跑一次（去重后重复执行无害，但避免双倍 IPC 读取）
    if (settingsInitRef.current) return
    settingsInitRef.current = true
    if (!window.desktopAPI) {
      setSettingsReady(true)
      return
    }
    const api = window.desktopAPI.settings
    Promise.all([
      api.get('theme'),
      api.get('attachmentDirectory'),
      api.get('autosave'),
      api.get('spellcheck'),
      api.get('multiWindow'),
      api.get('fontSize'),
      api.get('zoom'),
      api.get('sidebarWidth'),
      api.get('contentWidth'),
      api.get('lineHeight'),
      api.get('contentFont'),
      api.get('writingStats'),
      api.get('recentFiles'),
      api.get('shortcuts'),
      api.get('session'),
      api.get('drafts'),
      api.get('searchState'),
      api.get('blankClickToEnd'),
      api.get('codeLineNumbers'),
      api.get('customCss'),
      api.get('exportCss'),
      window.desktopAPI.imageHost.getStatus(),
      api.get('spellcheckLang'),
      api.get('sidebarCollapsedKeys'),
      api.get('sidebarActiveTab'),
      api.get('showFrontmatterProps'),
      api.get('graphSettings'),
      api.get('collapseFoldersOnOpen'),
      api.get('wordGoal'),
      api.get('wordGoalOverrides'),
    ])
      .then(async ([t, ad, a, sp, mw, f, z, sw, cw, lh, cf, ws, rf, sc, s, dr, srch, bce, cln, ccs, ecss, ih, scl, sck, sat, sfmp, gset, cfo, wg, wgo]) => {
        if (t?.ok && typeof t.data === 'string') setTheme(t.data)
        if (ad?.ok && typeof ad.data === 'string') {
          setGlobalAttachmentDirectory(ad.data.trim() || 'attachments')
        }
        if (a?.ok && typeof a.data === 'boolean') setAutosave(a.data)
        if (sp?.ok && typeof sp.data === 'boolean') setSpellcheck(sp.data)
        if (mw?.ok && typeof mw.data === 'boolean') setMultiWindow(mw.data)
        if (f?.ok) {
          const v =
            typeof f.data === 'number'
              ? f.data
              : f.data === 'sm'
                ? 14
                : f.data === 'lg'
                  ? 18
                  : 16
          setFontSize(v)
        }
        if (z?.ok && typeof z.data === 'number') {
          setZoom(Math.min(1.8, Math.max(0.7, z.data)))
        }
        if (sw?.ok && typeof sw.data === 'number') {
          setSidebarWidth(Math.min(480, Math.max(180, sw.data)))
        }
        if (cw?.ok) {
          const v =
            typeof cw.data === 'number'
              ? cw.data
              : cw.data === 'narrow'
                ? 640
                : cw.data === 'wide'
                  ? 1200
                  : 900
          setContentWidth(v)
        }
        if (lh?.ok) {
          const v =
            typeof lh.data === 'number'
              ? lh.data
              : lh.data === 'compact'
                ? 1.65
                : lh.data === 'loose'
                  ? 2.1
                  : 1.85
          setLineHeight(v)
        }
        if (
          cf?.ok &&
          (cf.data === 'default' || cf.data === 'serif' || cf.data === 'mono')
        ) {
          setContentFont(cf.data)
        }
        if (ws?.ok && ws.data && typeof ws.data === 'object') {
          const loaded = ws.data as WritingStats
          if (typeof loaded.words === 'number' && Array.isArray(loaded.history)) {
            setWritingStats(rollStatsDate({ ...EMPTY_STATS, ...loaded }))
          }
        }
        if (rf?.ok && Array.isArray(rf.data)) {
          const rec = (rf.data as RecentFile[])
            .filter((r) => r && typeof r.path === 'string' && typeof r.name === 'string')
            .slice(0, 10)
          setRecentFiles(rec)
        }
        if (sc?.ok) {
          setShortcuts(mergeShortcuts(sc.data))
        }
        // U4：恢复上次的搜索状态
        if (srch?.ok && srch.data && typeof srch.data === 'object') {
          const v = srch.data as {
            query?: unknown
            useRegex?: unknown
            caseSensitive?: unknown
            wholeWord?: unknown
            replacement?: unknown
          }
          setSearchPref({
            query: typeof v.query === 'string' ? v.query : '',
            useRegex: v.useRegex === true,
            caseSensitive: v.caseSensitive === true,
            wholeWord: v.wholeWord === true,
            replacement: typeof v.replacement === 'string' ? v.replacement : '',
          })
        }
        // U8：空白区点击行为开关
        if (bce?.ok && typeof bce.data === 'boolean') setBlankClickToEnd(bce.data)
        // 代码块行号开关
        if (cln?.ok && typeof cln.data === 'boolean') setCodeLineNumbers(cln.data)
        // 自定义主题 CSS
        if (ccs?.ok && ccs.data && typeof ccs.data === 'object') {
          const v = ccs.data as { name?: unknown; content?: unknown }
          if (typeof v.content === 'string' && v.content) {
            setCustomCss({ name: typeof v.name === 'string' ? v.name : 'custom.css', content: v.content })
          }
        }
        // 导出模板 CSS
        if (ecss?.ok && ecss.data && typeof ecss.data === 'object') {
          const v = ecss.data as { name?: unknown; content?: unknown }
          if (typeof v.content === 'string' && v.content) {
            setExportCss({ name: typeof v.name === 'string' ? v.name : 'export.css', content: v.content })
          }
        }
        // 图床配置
        if (ih?.ok && ih.data && typeof ih.data === 'object') {
          const v = ih.data as { provider?: unknown; configured?: unknown }
          setImageHost({
            provider: v.provider === 'smms' ? 'smms' : 'local',
            configured: v.configured === true,
          })
        }
        // 拼写检查语言
        if (scl?.ok && typeof scl.data === 'string') setSpellcheckLang(scl.data)
        // 旧版侧栏活动视图迁移到右侧上下文面板；左侧统一恢复文件树。
        if (sat?.ok && typeof sat.data === 'string') {
          const legacyPanel: ContextDockPanel =
            sat.data === 'links' || sat.data === 'tags' || sat.data === 'quality'
              ? sat.data
              : 'outline'
          setSidebarActiveTab('files')
          setContextDockState((current) => ({ ...current, panel: legacyPanel }))
        }
        // frontmatter 属性面板开关恢复
        if (sfmp?.ok && typeof sfmp.data === 'boolean') setShowFrontmatterProps(sfmp.data)
        if (gset?.ok && gset.data && typeof gset.data === 'object') {
          // 图谱设置逐字段校验钳制，损坏/缺省字段回退默认值
          const saved = gset.data as Record<string, unknown>
          const clamp = (v: unknown, min: number, max: number, dflt: number): number =>
            typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt
          // 旧默认 textFade=2（标签随缩放渐显）迁移为 10（默认不显示文件名，
          // 仅悬停显示——Obsidian 默认行为，大图渲染上千标签会拖垮帧率）
          const rawTextFade = clamp(saved.textFade, 0, 10, 10)
          setGraphSettings({
            search: typeof saved.search === 'string' ? saved.search : '',
            arrows: saved.arrows === true,
            animate: saved.animate === true,
            folderColor: saved.folderColor === true,
            showOrphans: saved.showOrphans === true,
            nodeSize: clamp(saved.nodeSize, 0.5, 2, 1),
            linkThickness: clamp(saved.linkThickness, 0.5, 3, 1),
            textFade: rawTextFade === 2 ? 10 : rawTextFade,
            centerForce: clamp(saved.centerForce, 0, 2, 1),
            repelForce: clamp(saved.repelForce, 0, 2, 1),
            linkForce: clamp(saved.linkForce, 0, 2, 1),
            linkDistance: clamp(saved.linkDistance, 30, 300, 92),
            maxNodes: clamp(saved.maxNodes, 100, 10000, DEFAULT_GRAPH_SETTINGS.maxNodes),
          })
        }
        // 默认打开文件夹全部折叠开关
        if (cfo?.ok && typeof cfo.data === 'boolean') setCollapseFoldersOnOpen(cfo.data)

        // fresh 窗口（多窗口模式新建）不恢复会话，避免多窗口互相覆盖
        const session = FRESH_MODE
          ? null
          : ((s?.ok ? s.data : null) as SessionData | null)
        // 侧边栏折叠记录恢复：新版按树作用域存储（Record<path, string[]>）。
        // 旧版平铺数组迁移到本次恢复的工作区名下（无工作区则归演示树），
        // 历史折叠状态不丢；迁移后用户下一次折叠/展开会以新格式写回
        if (sck?.ok && sck.data != null) {
          const scope = session?.workspacePath ?? DEMO_TREE_SCOPE
          const migrated: Record<string, string[]> = {}
          if (Array.isArray(sck.data)) {
            migrated[scope] = (sck.data as unknown[]).filter(
              (k): k is string => typeof k === 'string',
            )
          } else if (typeof sck.data === 'object') {
            for (const [k, v] of Object.entries(sck.data as Record<string, unknown>)) {
              if (
                typeof k === 'string' &&
                Array.isArray(v) &&
                v.every((x) => typeof x === 'string')
              ) {
                migrated[k] = v as string[]
              }
            }
          }
          setSidebarCollapsedKeys(Object.keys(migrated).length > 0 ? migrated : null)
        }
        // fresh 窗口也不恢复全局草稿：草稿属于主窗口会话，灌入未打开文件的脏状态会让新窗口"天生未保存"且无法关闭
        const drafts = FRESH_MODE ? {} : (((dr?.ok ? dr.data : null) ?? {}) as DraftMap)

        // 字数目标：全局默认 + 按文档 id 覆盖（值只接受 number | null）
        if (wg?.ok && (wg.data === null || typeof wg.data === 'number')) {
          setWordGoal(wg.data)
        }
        if (wgo?.ok && wgo.data && typeof wgo.data === 'object' && !Array.isArray(wgo.data)) {
          const overrides: Record<string, number | null> = {}
          for (const [key, value] of Object.entries(wgo.data as Record<string, unknown>)) {
            if (value === null || typeof value === 'number') overrides[key] = value
          }
          setWordGoalOverrides(overrides)
        }

        await restoreFromSessionData(session, drafts)
      })
      .catch((error: unknown) => {
        // 加载失败不应静默吞掉：设置损坏或草稿读取异常时至少留痕并提示用户
        console.error('[启动初始化] 加载设置或草稿失败：', error)
        setToast('部分设置或草稿加载失败，已使用默认值')
      })
      .finally(() => {
        setSettingsReady(true)
      })
    // 启动初始化只执行一次：依赖均为稳定引用（setState 与 restoreFromSessionData
    // 均不随渲染变化），补全依赖不会引发重复恢复
  }, [restoreFromSessionData, setAutosave, setContentFont, setContentWidth, setContextDockState, setFontSize, setLineHeight, setMultiWindow, setRecentFiles, setSearchPref, setSidebarActiveTab, setSidebarCollapsedKeys, setSpellcheck, setTheme, setToast, setWritingStats])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
    // 同步 Windows 标题栏覆盖层颜色，让系统按钮区与顶栏融为一体
    const colors = TITLEBAR_COLORS[effectiveTheme] ?? TITLEBAR_COLORS.default
    window.desktopAPI?.window.setTitlebarColor(colors.bg, colors.symbol).catch(() => {})
  }, [effectiveTheme])
  usePersistedSetting('theme', theme, settingsReady)
  usePersistedSetting('attachmentDirectory', globalAttachmentDirectory, settingsReady)

  usePersistedSetting('autosave', autosave, settingsReady)

  // 拼写检查：同步会话级开关 + 语言，并持久化
  useEffect(() => {
    window.desktopAPI?.window.setSpellcheck(spellcheck, spellcheckLang).catch(() => {})
  }, [spellcheck, spellcheckLang])
  usePersistedSetting('spellcheck', spellcheck, settingsReady)
  usePersistedSetting('spellcheckLang', spellcheckLang, settingsReady)

  // 多窗口模式持久化（主进程下次启动时读取，决定是否跳过单实例锁）
  usePersistedSetting('multiWindow', multiWindow, settingsReady)

  // 快捷键反查表更新
  useEffect(() => {
    const lookup: Record<string, string> = {}
    for (const [action, combo] of Object.entries(shortcuts)) {
      if (combo) lookup[combo] = action
    }
    shortcutLookupRef.current = lookup
  }, [shortcuts])
  usePersistedSetting('shortcuts', shortcuts, settingsReady)

  useEffect(() => {
    document.documentElement.style.setProperty('--efs', `${fontSize}px`)
  }, [fontSize])
  usePersistedSetting('fontSize', fontSize, settingsReady)

  useEffect(() => {
    document.documentElement.style.setProperty('--ecw', `${contentWidth}px`)
  }, [contentWidth])
  usePersistedSetting('contentWidth', contentWidth, settingsReady)

  useEffect(() => {
    document.documentElement.style.setProperty('--elh', String(lineHeight))
  }, [lineHeight])
  usePersistedSetting('lineHeight', lineHeight, settingsReady)

  // 内容字体：data 属性 + 持久化
  useEffect(() => {
    document.documentElement.setAttribute('data-contentfont', contentFont)
  }, [contentFont])
  usePersistedSetting('contentFont', contentFont, settingsReady)

  // 缩放：写入 CSS 变量并持久化
  useEffect(() => {
    document.documentElement.style.setProperty('--editor-zoom', String(zoom))
  }, [zoom])
  usePersistedSetting('zoom', zoom, settingsReady)

  // Ctrl/Cmd + 滚轮缩放编辑区。
  // 必须在全窗口范围 preventDefault：Chromium 对未拦截的 Ctrl+滚轮会执行
  // 页面级缩放（zoomFactor），在状态栏/顶栏/侧栏上会整体缩放 UI，与编辑器
  // 专属的 --editor-zoom（0.7–1.8）叠加造成布局错位；统一吞掉后仅编辑区缩放。
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (!(e.target instanceof Element) || !e.target.closest('.editor-content')) return
      const step = e.deltaY < 0 ? 0.1 : -0.1
      setZoom((z) => Math.min(1.8, Math.max(0.7, +(z + step).toFixed(2))))
    }
    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [])

  // 侧栏宽度持久化（拖拽中高频变化，防抖写入）
  usePersistedSetting('sidebarWidth', sidebarWidth, settingsReady, 500)

  /** 拖拽调整侧栏宽度 */
  const startSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidthRef.current
    const move = (ev: MouseEvent) => {
      // 侧栏带 zoom 缩放，屏幕像素增量需除以倍率
      const delta = (ev.clientX - startX) / zoomRef.current
      setSidebarWidth(Math.min(480, Math.max(180, startW + delta)))
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [])

  // 窗口标题随文档与保存状态变化
  useEffect(() => {
    document.title = `${saved ? '' : '● '}${docTitle} — MarkdownSoft`
  }, [docTitle, saved])

  // 有未保存内容时，关闭窗口前确认；退出前把防抖未落盘的设置立即写回。
  // 脏判定经统一文档记录视图（DocumentRecord.dirty），口径与 savedMap 一致
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (Object.values(documents).some((d) => d.dirty)) {
        e.preventDefault()
        e.returnValue = ''
      }
      // E7：防抖定时器随窗口销毁不再执行（写作统计 10s、最近文件 2s），
      // 退出时立即写回（best-effort；正式关窗路径由 saveAllBeforeWindowClose 兜底）
      flushPersistedSettings()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [documents])

  /* ==================== 会话与草稿持久化 ==================== */

  useDocumentSessionPersistence({
    activeFileId,
    demoFileIds: DEMO_FILE_IDS,
    freshMode: FRESH_MODE,
    openFiles,
    ready: settingsReady,
    workspace,
  })

  /** 轻提示自动消失 */
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timer)
  }, [toast, setToast])

  // 主进程关窗前保存超时/失败时经此通道提示（与 __markdownsoft_saveAll 配套）：
  // 渲染进程自身无法感知主进程的 15s 超时兜底，需主进程反向通知。
  useEffect(() => {
    const currentWindow = window as unknown as {
      __markdownsoft_notify?: (message: string) => void
    }
    currentWindow.__markdownsoft_notify = (message) => setToast(message)
    return () => {
      delete currentWindow.__markdownsoft_notify
    }
  }, [setToast])

  // 搜索状态持久化（U4：查询词/选项/替换文本，防抖 1 秒）
  usePersistedSetting('searchState', searchPref, settingsReady, 1_000)

  // 空白区点击行为开关持久化（U8）
  usePersistedSetting('blankClickToEnd', blankClickToEnd, settingsReady)

  // 代码块行号开关持久化
  usePersistedSetting('codeLineNumbers', codeLineNumbers, settingsReady)

  // 工作区布局持久化（打开列表/活动标签/侧栏宽度/折叠目录，防抖写入主进程）
  useWorkspaceLayoutPersistence({
    workspace,
    workspaceStateReady,
    collapsedKeys: workspaceCollapsedKeys,
    openFiles,
    activeFileId,
    sidebarWidth,
    sidebarActiveView: sidebarActiveTab,
    contextDock: contextDockState,
    setToast,
  })

  // frontmatter 属性面板开关持久化
  const [showFrontmatterProps, setShowFrontmatterProps] = useState(true)
  usePersistedSetting('showFrontmatterProps', showFrontmatterProps, settingsReady)

  // 默认打开文件夹全部折叠开关持久化（默认开启，匹配设置名「默认打开文件夹全部折叠」）
  const [collapseFoldersOnOpen, setCollapseFoldersOnOpen] = useState(true)
  usePersistedSetting('collapseFoldersOnOpen', collapseFoldersOnOpen, settingsReady)

  // 字数目标持久化：null 表示"未设置"，需显式写回（allowNull），否则清除目标无法落盘
  usePersistedSetting('wordGoal', wordGoal, settingsReady, 300, true)
  usePersistedSetting('wordGoalOverrides', wordGoalOverrides, settingsReady, 300)

  // 自定义主题：注入/移除 <style> 标签
  useEffect(() => {
    const STYLE_ID = 'custom-theme-css'
    let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (customCss?.content) {
      if (!el) {
        el = document.createElement('style')
        el.id = STYLE_ID
        document.head.appendChild(el)
      }
      el.textContent = customCss.content
    } else if (el) {
      el.remove()
    }
  }, [customCss])

  // 自定义主题持久化（E6：移除主题时显式写回 null，重启后不再复活旧主题）。
  // 经主进程专用通道写入（SETTINGS_SET 已禁止该键）：体积/形状在主进程校验，
  // 渲染层无法经通用设置接口绕过校验；读取仍走通用 get（启动恢复需要）。
  useEffect(() => {
    if (!settingsReady) return
    window.desktopAPI?.settings.setCustomCss(customCss).catch(() => {})
  }, [customCss, settingsReady])

  // 导出模板 CSS 持久化（与主题 CSS 同一受控通道族，主进程校验形状/体积）
  useEffect(() => {
    if (!settingsReady) return
    window.desktopAPI?.settings.setExportCss(exportCss).catch(() => {})
  }, [exportCss, settingsReady])

  // Wiki 链接自动补全候选文件列表
  const wikiLinkFileList = useMemo(() => {
    if (!workspace?.tree) return []
    const files = collectMdFiles(workspace.tree)
    return files.map((path) => ({
      // 与 collectMdFiles 的口径一致，.markdown 文件也要剥扩展名进候选
      name: path.replace(/\\/g, '/').split('/').pop()?.replace(/\.(md|markdown)$/i, '') ?? '',
      path,
    }))
  }, [workspace?.tree])

  // Wiki 链接点击处理 — 通过 ref 避免 handleSelectWorkspaceFile 循环依赖
  const wikiClickOpenRef = useRef(
    (path: string) => { void handleSelectWorkspaceFile(path) },
  )
  const handleWikiLinkClick = useCallback(
    (target: string) => {
      if (!workspace?.tree) return
      const result = resolveWikiTarget(
        target,
        workspace.path,
        activeFile?.path,
        workspace.tree,
      )
      if (result.resolved) {
        wikiClickOpenRef.current(result.path)
      } else {
        setToast(`无法找到链接的目标文件：${target}`)
      }
    },
    [workspace, activeFile, setToast],
  )

  /* ==================== 工作区链接索引（反链面板 / 知识图谱） ==================== */

  // fileMtime 每次保存成功都会更新 → 作为索引刷新信号（hook 内部有防抖 + mtime 缓存）
  const [linksRefreshTick, setLinksRefreshTick] = useState(0)
  useEffect(() => {
    setLinksRefreshTick((t) => t + 1)
  }, [fileMtime])
  const {
    graph: linkGraph,
    loading: linksLoading,
    truncated: linksTruncated,
    refresh: refreshLinks,
  } = useWorkspaceLinks({ workspace, refreshSignal: linksRefreshTick })

  /* ==================== 工作区标签索引（侧栏标签视图 / 文件树筛选） ==================== */

  const {
    index: tagIndex,
    loading: tagsLoading,
    truncated: tagsTruncated,
  } = useWorkspaceTags({ workspace, refreshSignal: linksRefreshTick })
  /** 当前标签筛选：文件树只显示含该标签的文件；切换工作区时清除 */
  const [tagFilter, setTagFilter] = useState<{ tag: string; paths: string[] } | null>(null)
  useEffect(() => {
    setTagFilter(null)
  }, [workspace?.path])
  const handleToggleTagFilter = useCallback(
    (tag: string) => {
      setTagFilter((prev) => {
        if (prev && prev.tag.toLowerCase() === tag.toLowerCase()) return null
        const files = tagIndex?.files ?? []
        const lower = tag.toLowerCase()
        const paths = files
          .filter((f) => f.tags.some((t) => t.toLowerCase() === lower))
          .map((f) => f.path)
        return paths.length > 0 ? { tag, paths } : null
      })
    },
    [tagIndex],
  )

  // 知识图谱作为内置标签页（固定在标签栏末尾）：tabOpen 控制标签存在，
  // tabActive 控制编辑器区显示图谱还是文档；切到文件标签即取消激活
  const [graphTabOpen, setGraphTabOpen] = useState(false)
  const [graphTabActive, setGraphTabActive] = useState(false)
  // 图谱设置（Obsidian 式面板）：持久化到应用设置
  const [graphSettings, setGraphSettings] = useState<GraphSettings>(DEFAULT_GRAPH_SETTINGS)
  usePersistedSetting('graphSettings', graphSettings, settingsReady)

  // 打开文件夹即自动展示整个工作区的知识图谱（含会话恢复重开工作区）
  const graphAutoOpenRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const path = workspace?.path
    if (path && graphAutoOpenRef.current !== path) {
      graphAutoOpenRef.current = path
      setGraphTabOpen(true)
      setGraphTabActive(true)
    }
    if (!path) graphAutoOpenRef.current = undefined
  }, [workspace?.path])

  /** 未解析链接判定（编辑器内虚线标记）：有工作区树才参与判定，演示模式不标记 */
  const wikiResolveTest = useMemo(() => {
    if (!workspace?.tree) return undefined
    const tree = workspace.tree
    const rootPath = workspace.path
    const currentPath = activeFile?.path
    return (target: string) =>
      resolveWikiTarget(target, rootPath, currentPath, tree).resolved
  }, [workspace, activeFile?.path])

  // 打开反链/出链指向的文件并接力文档内搜索定位（与工作区搜索结果点选同一模式）
  // → 已移入 app/useAppActions（handleOpenBacklink）

  const handleImageHostProviderChange = useCallback(
    async (provider: 'local' | 'smms') => {
      const result = await window.desktopAPI?.imageHost.setConfig(provider)
      if (!result?.ok || !result.data) {
        setToast('图床配置保存失败')
        return
      }
      setImageHost(result.data)
    },
    [setToast],
  )

  const handleImageHostTokenSave = useCallback(async (token: string): Promise<boolean> => {
    const result = await window.desktopAPI?.imageHost.setConfig('smms', token)
    if (!result?.ok || !result.data) {
      setToast('Token 保存失败')
      return false
    }
    setImageHost(result.data)
    setToast('Token 已保存')
    return true
  }, [setToast])

  /** 光标位置变化（无变化时返回原对象避免多余渲染） */
  const handleCursorChange = useCallback(
    (
      line: number,
      col: number,
      heading: string,
      headingIndex: number,
      selected: number,
    ) => {
      setCursorPos((prev) =>
        prev.line === line &&
        prev.col === col &&
        prev.heading === heading &&
        prev.headingIndex === headingIndex &&
        prev.selected === selected
          ? prev
          : { line, col, heading, headingIndex, selected },
      )
    },
    [],
  )

  /* ==================== 弹窗关闭器与顶层动作（app/useAppActions） ==================== */

  const {
    handleAction,
    runCommand,
    handleDocumentTitleBlur,
    handleDocumentTitleKeyDown,
    handleOpenBacklink,
    handleOpenGraphView,
    closeSettings,
    closeHelp,
    closeImages,
    closePdfOptions,
    closePublish,
    closeWorkspaceSearch,
    closePalette,
    closeVersionHistory,
    openOutlinePanel,
    commandRegistry,
  } = useAppActions({
    editorRef,
    docTitle,
    setDocTitle,
    activeFileId,
    activeFileIdRef,
    openFiles,
    openFilesRef,
    setOpenFiles,
    demoFileNames,
    activeFilePath: activeFile?.path,
    workspacePathRef,
    focusEditorSoon,
    setToast,
    handleNew,
    handleOpen,
    handleOpenFolder,
    handleSelectWorkspaceFile,
    handleSave,
    handleSaveAs,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    handleRenameFile,
    handleExportHtml,
    handleExportMarkdown,
    handleExportPandoc,
    handleExportDocx,
    setSearchMode,
    setFocusOutlineTick,
    setSidebarActiveTab,
    setContextDockState,
    setSearchPref,
    setSearchEpoch,
    setSidebarCollapsed,
    setFocusMode,
    setPreviewMode,
    setTypewriter,
    setZoom,
    centerCaret,
    setSettingsOpen,
    setHelpView,
    setImagesOpen,
    setPdfOptsOpen,
    setPublishOpen,
    handleNewFromTemplate,
    setWsSearchOpen,
    setPaletteOpen,
    setVersionHistoryOpen,
    setGraphTabOpen,
    setGraphTabActive,
    refreshLinks,
    getLayoutState: () => ({
      activeView: sidebarActiveTab,
      sidebarWidth,
      typewriterMode: typewriter,
    }),
    // 命令上下文的脏状态探针：口径与关闭前确认一致（DocumentRecord.dirty）
    getHasUnsavedChanges: () => Object.values(documents).some((d) => d.dirty),
    setSidebarWidth,
  })

  /* ==================== 自定义主题 ==================== */

  /** 导入自定义主题 CSS（选择文件 → 注入生效 → 持久化） */
  const handleImportCss = useCallback(async () => {
    if (!window.desktopAPI) return
    const res = await window.desktopAPI.document.pickCss()
    if (res.ok && res.data) {
      setCustomCss({ name: res.data.name, content: res.data.content })
      setToast(`已应用自定义主题：${res.data.name}`)
    } else if (res.error?.code === 'TOO_LARGE') {
      setToast(res.error.message ?? 'CSS 文件过大')
    } else if (res.error?.code === 'IO_ERROR') {
      setToast('CSS 读取失败')
    }
  }, [setToast])

  /** 移除自定义主题 */
  const handleRemoveCss = useCallback(() => {
    setCustomCss(null)
    setToast('已移除自定义主题')
  }, [setToast])

  /** 导入导出模板 CSS（选择文件 → 持久化；HTML/PDF 导出时生效） */
  const handleImportExportCss = useCallback(async () => {
    if (!window.desktopAPI) return
    const res = await window.desktopAPI.document.pickCss()
    if (res.ok && res.data) {
      setExportCss({ name: res.data.name, content: res.data.content })
      setToast(`已应用导出样式：${res.data.name}`)
    } else if (res.error?.code === 'TOO_LARGE') {
      setToast(res.error.message ?? 'CSS 文件过大')
    } else if (res.error?.code === 'IO_ERROR') {
      setToast('CSS 读取失败')
    }
  }, [setToast])

  const handleRemoveExportCss = useCallback(() => {
    setExportCss(null)
    setToast('已恢复默认导出样式')
  }, [setToast])

  // 关闭搜索栏：重置搜索状态后把焦点还给编辑器（focusEditorSoon 来自文档会话）
  const closeSearch = useCallback(() => {
    resetSearchState()
    focusEditorSoon()
  }, [resetSearchState, focusEditorSoon])

  /** 图片管理扫描目录：当前文档旁 attachments → 工作区 attachments → 应用数据目录 */
  const imageDirs = useMemo(() => {
    const dirs: string[] = []
    if (activeFile?.path) {
      dirs.push(`${activeFile.path.replace(/[\\/][^\\/]+$/, '')}/attachments`)
    }
    if (workspace) dirs.push(`${workspace.path}/attachments`)
    return dirs
  }, [activeFile?.path, workspace])

  const handleOutlineClick = useCallback((index: number) => {
    const root = editorAreaRef.current
    if (!root) return
    // 与大纲面板 parseOutline 的枚举口径一致：列表项内标题（`- # foo`、`1. ## bar`）
    // 会被渲染层生成真实 h1/h2，但 Markdown 行级扫描不收录——不过滤 li 内标题
    // 会导致 DOM 索引进度快于大纲索引，点击大纲滚动/高亮到错误标题。
    // 引用块标题（`> # x`）两侧都收录，靠 closest('li') 判定不会误伤。
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4')).filter(
      (element) => !element.closest('li'),
    )
    const target = headings[index] as HTMLElement | undefined
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.style.transition = 'background 300ms'
    target.style.background = 'var(--accent-bg)'
    setTimeout(() => {
      target.style.background = ''
    }, 800)
  }, [])

  const activeProperties = useMemo(() => {
    if (!activeFile?.path || !activeContent) return null
    const extracted = extractFrontmatterRaw(activeContent)
    return extracted ? parseFrontmatterYaml(extracted.text) : null
  }, [activeContent, activeFile?.path])

  const handleUpdateProperty = useCallback((key: string, value: string) => {
    replaceEditorContent(
      activeFileId,
      setFrontmatterProperty(liveContentOf(activeFileId), key, value),
      'update',
    )
  }, [activeFileId, liveContentOf, replaceEditorContent])

  const handleDeleteProperty = useCallback((key: string) => {
    replaceEditorContent(
      activeFileId,
      deleteFrontmatterProperty(liveContentOf(activeFileId), key),
      'update',
    )
  }, [activeFileId, liveContentOf, replaceEditorContent])

  const handleAddProperty = useCallback((key: string, value: string) => {
    if (!isValidFrontmatterPropertyKey(key)) {
      setToast('属性名只能包含字母、数字、下划线和连字符')
      return
    }
    const current = liveContentOf(activeFileId)
    const extracted = extractFrontmatterRaw(current)
    if (extracted && getFrontmatterPropertyKeys(extracted.text).includes(key)) {
      setToast(`属性“${key}”已存在；请编辑现有属性或正文 YAML`)
      return
    }
    replaceEditorContent(activeFileId, setFrontmatterProperty(current, key, value), 'update')
  }, [activeFileId, liveContentOf, replaceEditorContent, setToast])

  /* ==================== 全局快捷键（可自定义，查表分发） ==================== */

  // 快捷键保存与菜单/命令面板共用命令注册表的同一 execute（Task 5 迁移）
  const executeSaveCommand = useCallback(() => {
    void runCommand('save')
  }, [runCommand])

  useGlobalShortcuts({
    shortcutLookupRef,
    modalOpenRef,
    fullscreenOpenRef,
    editorRef,
    activeFileIdRef,
    handleNew,
    handleOpen,
    handleOpenFolder,
    handleSave: executeSaveCommand,
    handleSaveAs,
    handleCloseTab,
    openOutlinePanel,
    setPaletteOpen,
    setSearchMode,
    setSidebarCollapsed,
    setPreviewMode,
    setZoom,
    setFocusMode,
  })

  /* ==================== 渲染 ==================== */

  const currentFileSource: CurrentFileSource = classifyDocumentSource(
    activeFile?.path,
    workspace?.path,
    window.desktopAPI?.platform === 'win32',
  )

  return (
    <div
      className={`app ${focusMode ? 'focus-mode' : ''} ${typewriter ? 'typewriter-mode' : ''}`}
      onDragOver={(e) => {
        // 仅当拖入操作系统文件时拦截，避免阻塞内部拖拽（标签重排 / 侧栏移动）
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
        }
      }}
      onDrop={(e) => {
        // 内部拖拽使用自定义数据，不含 'Files'，直接放行给内部处理器
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        // 仅打开 .md / .markdown；非 Markdown 文件（如图片）忽略，
        // 仍交由编辑器自身的图片插入拖拽处理。
        // 路径经预加载层 webUtils 解析（安全边界），读取成功（即已授权）
        // 后再按路径走统一打开逻辑
        for (const file of extractMarkdownFiles(e.dataTransfer)) {
          void window.desktopAPI.document
            .readDropped(file)
            .then((result) => {
              if (result.ok && result.data) {
                void handleSelectWorkspaceFile(result.data.path)
              } else if (result.error?.code === 'TOO_LARGE') {
                setToast(result.error.message ?? 'Markdown 文件超过 20MB，无法打开')
              } else if (result.error?.code !== 'INVALID_PATH') {
                setToast('拖入文件读取失败')
              }
            })
        }
      }}
    >
      {/* 顶部栏：品牌区 + 菜单 + 文档标题 + 操作按钮（无独立系统标题栏，已合二为一） */}
      <div className="topbar">
        <div className="brand" title="MarkdownSoft">
          <img className="brand-icon" src="./icon.png" alt="" />
          <span className="brand-name">MarkdownSoft</span>
        </div>
        <MenuBar onAction={handleAction} recentFiles={recentFiles} shortcuts={shortcuts} />
        <div className="topbar-spacer" />
        {openFiles.length > 0 && (
          <div
            ref={titleRef}
            className="doc-title"
            contentEditable
            role="textbox"
            aria-label="文档文件名"
            aria-multiline={false}
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={handleDocumentTitleBlur}
            onKeyDown={handleDocumentTitleKeyDown}
          >
            {docTitle}
          </div>
        )}
        <div className="act-group">
          <button
            type="button"
            className={`act-btn ${!sidebarCollapsed ? 'active' : ''}`}
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label="切换侧栏"
            aria-pressed={!sidebarCollapsed}
            title="切换侧栏 (Ctrl+J)"
          >
            <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
          </button>
          <button
            type="button"
            className={`act-btn ${focusMode ? 'active' : ''}`}
            onClick={() => setFocusMode((v) => !v)}
            aria-label="切换专注模式"
            aria-pressed={focusMode}
            title="专注模式 (F11)"
          >
            <svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" /></svg>
          </button>
          <ThemeSwitcher currentTheme={effectiveTheme} onThemeChange={handleThemeChange} />
          <button
            type="button"
            className={`act-btn ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen(true)}
            aria-label="打开设置"
            title="设置"
          >
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
          </button>
        </div>
      </div>

      {/* 工作区壳层持续提供知识库上下文；当前文件只是其中的焦点。 */}
      <WorkspaceShell
        workspaceName={workspace?.name ?? '未打开知识库'}
        workspacePath={workspace?.path}
      >
        {/* 工作区：侧栏 + 编辑器 */}
        <div
          className="workspace"
          ref={editorAreaRef}
          style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
        >
        {/* L16：侧栏始终挂载，折叠只改宽度（保留滚动位置/重命名状态） */}
        <Sidebar
          collapsed={sidebarCollapsed}
          demoTree={DEMO_TREE}
            demoFileNames={demoFileNames}
            workspace={workspace}
            openFiles={openFiles}
            activeFileId={activeFileId}
            onSelectDemoFile={handleSelectDemoFile}
            onSelectWorkspaceFile={(path, pinned) =>
              void handleSelectWorkspaceFile(path, pinned)
            }
            onCreateFile={(dir) => void handleCreateFile(dir)}
            onRenameFile={(path, name) => void handleRenameFile(path, name)}
            onDeleteFile={(path) => void handleDeleteFile(path)}
            onMoveFile={(path, targetDir) => void handleMoveFile(path, targetDir)}
            onOpenInNewWindow={handleOpenInNewWindow}
            initialCollapsedKeys={currentCollapsedKeys}
            onCollapsedKeysChange={handleCollapsedKeysChange}
            collapseFoldersOnOpen={collapseFoldersOnOpen}
          />
        <button
          type="button"
          className={`sidebar-toggle ${sidebarCollapsed ? 'flipped' : ''}`}
          onClick={() => setSidebarCollapsed((v) => !v)}
          aria-label={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
          aria-pressed={!sidebarCollapsed}
          title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}
        >
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        {/* 侧栏宽度拖拽条 */}
        {!sidebarCollapsed && (
          <div className="sidebar-resizer" onMouseDown={startSidebarResize} />
        )}
        {/* 查找替换栏（key 变化时重挂载，用于工作区搜索结果带入时重新执行搜索） */}
        {searchMode !== 'none' && (
          <SearchBar
            key={searchEpoch}
            withReplace={searchMode === 'replace'}
            onClose={closeSearch}
            count={searchCount}
            current={searchCurrent}
            initial={searchPref}
            {...searchHandlers}
          />
        )}
        <div className="editor-host">
          {openFiles.length > 0 && (
            <CurrentFileBanner
              title={docTitle}
              path={activeFile?.path}
              workspacePath={workspace?.path}
              workspaceName={workspace?.name ?? '本地工作区'}
              source={currentFileSource}
              dirty={!saved}
            />
          )}
          {/* 标签栏属于编辑器区域，不占用左侧文件树和大纲的顶部空间。 */}
          <TabBar
            openFiles={openFiles}
            activeFileId={activeFileId}
            savedMap={savedMap}
            onSwitch={(id) => {
              // 切到文件标签 = 离开图谱视图（图谱标签保持打开）
              setGraphTabActive(false)
              switchFile(id)
            }}
            onClose={handleCloseTab}
            onCloseOthers={handleCloseOtherTabs}
            onCloseAll={handleCloseAllTabs}
            onTogglePin={handleTogglePinnedTab}
            onReorder={handleReorderTabs}
            graphTabOpen={graphTabOpen}
            graphTabActive={graphTabActive}
            onGraphTabSwitch={() => setGraphTabActive(true)}
            onGraphTabClose={() => {
              setGraphTabOpen(false)
              setGraphTabActive(false)
            }}
          />
          <div className="editor-content">
            <Editor
              ref={editorRef}
              initialContent={DEMO_FILES[DEFAULT_FILE_ID].content}
              onChange={handleEditorChange}
              onCursorChange={handleCursorChange}
              onRichRender={handleRichRender}
              blankClickToEnd={blankClickToEnd}
              codeLineNumbers={codeLineNumbers}
              onNotify={setToast}
              wikiLinkFiles={wikiLinkFileList}
              onWikiLinkClick={handleWikiLinkClick}
              wikiResolveTest={wikiResolveTest}
              onFullscreenChange={handleFullscreenChange}
              imageHints={{
                documentId: activeFileId,
                docPath: activeFile?.path,
                workspacePath: workspace?.path,
                workspaceAttachmentDirectory: workspace ? workspaceSettings.editor.attachmentDirectory : null,
                globalAttachmentDirectory,
                imageHost,
              }}
            />
            {/* 知识图谱内置标签视图：覆盖在编辑器上方（编辑器实例保持挂载，切回不丢状态） */}
            {graphTabOpen && (
              <GraphView
                active={graphTabActive}
                graph={linkGraph}
                activePath={activeFile?.path ?? null}
                workspaceName={workspace?.name ?? ''}
                truncated={linksTruncated}
                settings={graphSettings}
                onSettingsChange={setGraphSettings}
                workspaceIndex={workspaceIndex}
                onClose={() => {
                  setGraphTabOpen(false)
                  setGraphTabActive(false)
                  focusEditorSoon()
                }}
                onOpenNode={(path) => {
                  setGraphTabActive(false)
                  void handleSelectWorkspaceFile(path)
                }}
                onGhostClick={(target) => setToast(`链接目标未创建：${target}`)}
              />
            )}
            {/* 分栏预览（内容由 renderPreview 直接写入 DOM，避免 React 协调开销） */}
            {previewMode && (
              <div className="preview-pane" ref={previewPaneRef}>
                <div className="editor-inner preview-content" ref={previewContentRef} />
              </div>
            )}
            {/* 全部标签页关闭后显示开始界面（左侧文件夹树仍保留） */}
            {openFiles.length === 0 && (
              <StartScreen
                onNew={handleNew}
                onOpen={() => void handleOpen()}
                onOpenFolder={() => void handleOpenFolder()}
              />
            )}
          </div>
        </div>
        <ContextDock
          state={contextDockState}
          onStateChange={setContextDockState}
          hasWorkspace={workspace !== null}
          hasActiveDocument={openFiles.length > 0}
          content={activeContent}
          activeFileId={activeFileId}
          activeOutlineIndex={cursorPos.headingIndex}
          onOutlineClick={handleOutlineClick}
          linkGraph={linkGraph}
          workspaceIndex={workspaceIndex}
          sidebarViewModel={contextDockViewModel}
          activeLinkPath={activeFile?.path ?? null}
          linksLoading={linksLoading}
          linksTruncated={linksTruncated}
          onOpenLink={handleOpenBacklink}
          onUnresolvedLinkClick={(target) => setToast(`链接目标未创建：${target}`)}
          onOpenGraphView={handleOpenGraphView}
          tagsFiles={tagIndex?.files ?? null}
          tagsLoading={tagsLoading}
          tagsTruncated={tagsTruncated}
          tagFilter={tagFilter}
          onToggleTagFilter={handleToggleTagFilter}
          onOpenWorkspaceFile={(path) => void handleSelectWorkspaceFile(path)}
          diagnostics={diagnostics}
          indexLoading={indexLoading}
          onRefreshIndex={() => {
            if (!workspace?.path || !window.desktopAPI) return
            setIndexLoading(true)
            void window.desktopAPI.workspace.index.refresh(workspace.path).then((result) => {
              if (!result.ok) setIndexLoading(false)
            }).catch(() => setIndexLoading(false))
          }}
          onCancelIndex={() => {
            if (workspace?.path) void window.desktopAPI?.workspace.index.cancel(workspace.path)
          }}
          onOpenDiagnostic={(diagnostic) => {
            if (!diagnostic.path) return
            void handleSelectWorkspaceFile(diagnostic.path).then((ok) => {
              if (!ok) return
              if (diagnostic.line) editorRef.current?.focusLine(diagnostic.line)
            })
          }}
          typographyIssues={typographyIssues}
          onOpenTypographyIssue={handleOpenTypographyIssue}
          onFixTypography={handleFixTypography}
          properties={activeProperties}
          showProperties={showFrontmatterProps}
          onToggleProperties={() => setShowFrontmatterProps((value) => !value)}
          onUpdateProperty={handleUpdateProperty}
          onDeleteProperty={handleDeleteProperty}
          onAddProperty={handleAddProperty}
        />
        </div>
      </WorkspaceShell>

      {/* 底部状态栏 */}
      <StatusBar
        saved={saved}
        wordCount={wordCount}
        lineCount={lineCount}
        readTime={readTime}
        cursorLine={cursorPos.line}
        cursorCol={cursorPos.col}
        currentHeading={cursorPos.heading}
        modifiedTime={fileMtime[activeFileId]}
        selectedChars={cursorPos.selected}
        encoding={encodingMap[activeFileId] ?? 'UTF-8'}
        sectionWords={currentSectionWords}
        goalWords={effectiveGoal}
        goalPercent={goalPercent}
        onGoalChange={handleGoalChange}
      />

      {/* 弹窗：设置 / 帮助 */}
      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        theme={effectiveTheme}
        onThemeChange={handleThemeChange}
        workspaceAvailable={workspace !== null}
        workspaceThemeEnabled={workspaceSettings.appearance.theme !== 'inherit'}
        onWorkspaceThemeEnabledChange={handleWorkspaceThemeEnabledChange}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        contentWidth={contentWidth}
        onContentWidthChange={setContentWidth}
        lineHeight={lineHeight}
        onLineHeightChange={setLineHeight}
        contentFont={contentFont}
        onContentFontChange={setContentFont}
        zoom={zoom}
        onZoomChange={setZoom}
        autosave={autosave}
        onAutosaveChange={setAutosave}
        typewriter={typewriter}
        onTypewriterChange={setTypewriter}
        spellcheck={spellcheck}
        onSpellcheckChange={setSpellcheck}
        spellcheckLang={spellcheckLang}
        onSpellcheckLangChange={setSpellcheckLang}
        multiWindow={multiWindow}
        onMultiWindowChange={setMultiWindow}
        blankClickToEnd={blankClickToEnd}
        onBlankClickToEndChange={setBlankClickToEnd}
        codeLineNumbers={codeLineNumbers}
        onCodeLineNumbersChange={setCodeLineNumbers}
        collapseFoldersOnOpen={collapseFoldersOnOpen}
        onCollapseFoldersOnOpenChange={setCollapseFoldersOnOpen}
        wordGoal={wordGoal}
        onWordGoalChange={setWordGoal}
        customCssName={customCss?.name ?? null}
        onImportCss={() => void handleImportCss()}
        onRemoveCss={handleRemoveCss}
        exportCssName={exportCss?.name ?? null}
        onImportExportCss={() => void handleImportExportCss()}
        onRemoveExportCss={handleRemoveExportCss}
        imageHost={imageHost}
        onImageHostProviderChange={handleImageHostProviderChange}
        onImageHostTokenSave={handleImageHostTokenSave}
        globalAttachmentDirectory={globalAttachmentDirectory}
        onGlobalAttachmentDirectoryChange={(value) => {
          const normalized = value.trim() ? normalizeWorkspaceRelativePath(value) : null
          if (value.trim() && !normalized) {
            setToast('附件目录必须是工作区内的相对路径')
            return
          }
          setGlobalAttachmentDirectory(normalized ?? 'attachments')
        }}
        workspaceAttachmentDirectory={workspaceSettings.editor.attachmentDirectory}
        onWorkspaceAttachmentDirectoryChange={(value) => {
          const normalized = value?.trim() ? normalizeWorkspaceRelativePath(value) : null
          if (value?.trim() && !normalized) {
            setToast('附件目录必须是工作区内的相对路径')
            return
          }
          setWorkspaceSettings((current) => ({ ...current, editor: { attachmentDirectory: normalized } }))
        }}
        shortcuts={shortcuts}
        onShortcutsChange={setShortcuts}
      />
      <HelpDialog view={helpView} onClose={closeHelp} stats={writingStats} shortcuts={shortcuts} />
      <ImagesDialog
        open={imagesOpen}
        onClose={closeImages}
        dirs={imageDirs}
        onNotify={setToast}
      />
      <ExportPdfDialog
        open={pdfOptsOpen}
        onClose={closePdfOptions}
        onExport={(opts) => {
          setPdfOptsOpen(false)
          void handleDoExportPdf(opts)
        }}
      />
      <PublishDialog
        open={publishOpen}
        busy={publishBusy}
        hasWorkspace={workspace !== null}
        availableTags={availableTags}
        onClose={closePublish}
        onExportBundle={(opts: PublishOptions, scope: PublishScope) => {
          setPublishOpen(false)
          setPublishBusy(true)
          void handlePublishBundle(opts, scope).finally(() => setPublishBusy(false))
        }}
        onCopyRichText={(opts: PublishOptions) => {
          setPublishOpen(false)
          setPublishBusy(true)
          void handleCopyRichText(opts).finally(() => setPublishBusy(false))
        }}
      />
      <CommandPalette
        open={paletteOpen}
        workspace={workspace}
        recentFiles={recentFiles}
        onClose={closePalette}
        onSelectWorkspace={(path, pinned) => {
          void handleSelectWorkspaceFile(path, pinned)
        }}
        onSelectDemo={(id, pinned) => {
          handleSelectDemoFile(id, pinned)
        }}
        onRunCommand={handleAction}
        commandRegistry={commandRegistry}
        commandContext={createCommandContext({
          activeFileId,
          workspaceId: workspace?.path,
          hasWorkspace: workspace !== null,
          hasUnsavedChanges: Object.values(documents).some((document) => document.dirty),
        })}
      />
      <VersionHistoryDialog
        open={versionHistoryOpen}
        filePath={activeFile?.path ?? null}
        docName={activeFile?.name ?? ''}
        currentContent={liveContentOf(activeFileId)}
        onClose={closeVersionHistory}
        onRestore={(content) => {
          setVersionHistoryOpen(false)
          replaceEditorContent(activeFileId, content, 'update')
          setToast('已恢复历史版本到编辑器（未保存），确认后按 Ctrl+S 写入磁盘')
        }}
      />
      {workspace && (
        <WorkspaceSearchDialog
          open={wsSearchOpen}
          workspacePath={workspace.path}
          workspaceName={workspace.name}
          workspaceIndex={workspaceIndex}
          onClose={closeWorkspaceSearch}
          onSelect={(path, query, opts) => {
            setWsSearchOpen(false)
            // 必须等文件内容替换完成后再开搜索栏，否则搜索会作用在旧文档上；
            // 序号防护连续点击的竞态；打开失败时不弹搜索栏
            const seq = ++wsSelectSeqRef.current
            void (async () => {
              const ok = await handleSelectWorkspaceFile(path)
              if (seq !== wsSelectSeqRef.current || !ok) return
              if (query) {
                setSearchPref((prev) => ({
                  ...prev,
                  query,
                  useRegex: opts?.useRegex ?? prev.useRegex,
                  caseSensitive: opts?.caseSensitive ?? prev.caseSensitive,
                }))
                setSearchEpoch((e) => e + 1)
                setSearchMode('find')
              }
            })()
          }}
        />
      )}

      {/* 轻提示 */}
      {toast && <div className="toast">{toast}</div>}

      {/* 关闭前决策确认框（保存/放弃/取消） */}
      <ConfirmDialog
        request={confirmRequest}
        onResolve={(id) => {
          confirmRequest?.resolve(id)
          setConfirmRequest(null)
        }}
      />
    </div>
  )
}
