import { Suspense, lazy, useRef } from 'react'
import { CommandPalette } from '../components/CommandPalette'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { ActiveConfirmRequest } from '../components/ConfirmDialog'
import type { HelpView, WritingStats } from '../components/HelpDialog'
import type { PdfOptions } from '../components/ExportPdfDialog'
import type { EditorHandle } from '../components/Editor'
import type { EditorViewState } from '../components/Editor/content/editor-view-state'
import { buildSourceCitation, citationTargetsCurrentDocument } from '../lib/source-citation'
import type { PublishOptions, PublishScope } from '../lib/export-bundle'

/**
 * 低频对话框懒加载：设置 / 帮助 / 图片 / PDF 选项 / 发布 / 版本历史 / 工作区全文搜索
 * 平时不占界面，组件各自在 open=false（或 view 为空）时返回 null。这里改成
 * 「打开时才挂载 + Suspense」，挂载语义不变，但对应 chunk 只在首次打开时才加载，
 * 不再挤占首屏主包。
 *
 * CommandPalette（Ctrl+P 命令面板）与 ConfirmDialog（关闭确认）是高频路径，
 * 刻意保持静态导入，避免高频入口出现首开延迟。
 */
const SettingsDialog = lazy(() =>
  import('../components/SettingsDialog').then((m) => ({ default: m.SettingsDialog })),
)
const HelpDialog = lazy(() =>
  import('../components/HelpDialog').then((m) => ({ default: m.HelpDialog })),
)
const ImagesDialog = lazy(() =>
  import('../components/ImagesDialog').then((m) => ({ default: m.ImagesDialog })),
)
const ExportPdfDialog = lazy(() =>
  import('../components/ExportPdfDialog').then((m) => ({ default: m.ExportPdfDialog })),
)
const PublishDialog = lazy(() =>
  import('../components/PublishDialog').then((m) => ({ default: m.PublishDialog })),
)
const VersionHistoryDialog = lazy(() =>
  import('../components/VersionHistoryDialog').then((m) => ({ default: m.VersionHistoryDialog })),
)
const WorkspaceSearchDialog = lazy(() =>
  import('../components/WorkspaceSearchDialog').then((m) => ({ default: m.WorkspaceSearchDialog })),
)
import type { ShortcutMap } from '../data/shortcuts'
import type { RecentFile } from '../components/MenuBar'
import type { AppCommandRegistry } from './commands/app-command-registry'
import type { CommandContext } from './commands/app-command'
import type { WorkspaceIndex } from '../../../shared/workspace-index'
import type { WorkspaceInfo } from '../components/Sidebar'
import type { WorkspaceSettingsState } from '../../../shared/workspace-state'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppDialogsProps {
  // 设置对话框
  settingsOpen: boolean
  onCloseSettings: () => void
  effectiveTheme: string
  onThemeChange: (theme: string) => void
  workspace: WorkspaceInfo | null
  workspaceSettings: WorkspaceSettingsState
  onWorkspaceThemeEnabledChange: (enabled: boolean) => void
  fontSize: number
  onFontSizeChange: (v: number) => void
  contentWidth: number
  onContentWidthChange: (v: number) => void
  lineHeight: number
  onLineHeightChange: (v: number) => void
  contentFont: 'default' | 'serif' | 'mono'
  onContentFontChange: (v: 'default' | 'serif' | 'mono') => void
  zoom: number
  onZoomChange: (v: number) => void
  autosave: boolean
  onAutosaveChange: (v: boolean) => void
  typewriter: boolean
  onTypewriterChange: (v: boolean) => void
  spellcheck: boolean
  onSpellcheckChange: (v: boolean) => void
  spellcheckLang: string
  onSpellcheckLangChange: (v: string) => void
  multiWindow: boolean
  onMultiWindowChange: (v: boolean) => void
  blankClickToEnd: boolean
  onBlankClickToEndChange: (v: boolean) => void
  codeLineNumbers: boolean
  onCodeLineNumbersChange: (v: boolean) => void
  collapseFoldersOnOpen: boolean
  onCollapseFoldersOnOpenChange: (v: boolean) => void
  wordGoal: number | null
  onWordGoalChange: (v: number | null) => void
  customCssName: string | null
  onImportCss: () => void
  onRemoveCss: () => void
  exportCssName: string | null
  onImportExportCss: () => void
  onRemoveExportCss: () => void
  imageHost: { provider: 'local' | 'smms'; configured: boolean }
  onImageHostProviderChange: (provider: 'local' | 'smms') => Promise<void>
  onImageHostTokenSave: (token: string) => Promise<boolean>
  globalAttachmentDirectory: string
  onGlobalAttachmentDirectoryChange: (value: string) => void
  workspaceAttachmentDirectory: string | null
  onWorkspaceAttachmentDirectoryChange: (value: string | null) => void
  shortcuts: ShortcutMap
  onShortcutsChange: (v: ShortcutMap) => void
  // 帮助对话框
  helpView: HelpView
  onCloseHelp: () => void
  writingStats: WritingStats
  // 图片管理
  imagesOpen: boolean
  onCloseImages: () => void
  imageDirs: string[]
  setToast: (message: string) => void
  // PDF 导出
  pdfOptsOpen: boolean
  onClosePdfOptions: () => void
  onExportPdf: (opts: PdfOptions) => void
  // 发布
  publishOpen: boolean
  publishBusy: boolean
  availableTags: string[]
  onClosePublish: () => void
  onExportBundle: (opts: PublishOptions, scope: PublishScope) => void
  onCopyRichText: (opts: PublishOptions) => void
  // 命令面板
  paletteOpen: boolean
  onClosePalette: () => void
  recentFiles: RecentFile[]
  onSelectWorkspaceFile: (path: string, pinned?: boolean) => void
  onSelectDemoFile: (id: string, pinned?: boolean) => void
  onRunCommand: (action: string) => void
  commandRegistry: AppCommandRegistry
  commandContext: CommandContext
  // 版本历史
  versionHistoryOpen: boolean
  onCloseVersionHistory: () => void
  activeFilePath: string | null
  activeFileName: string
  currentContent: string
  onRestoreVersion: (content: string) => void
  // 工作区搜索
  wsSearchOpen: boolean
  onCloseWorkspaceSearch: () => void
  workspaceIndex: WorkspaceIndex | null
  onSelectSearchResult: (path: string, query: string, opts?: { useRegex?: boolean; caseSensitive?: boolean }) => void
  activeFileId: string
  editorRef: { current: EditorHandle | null }
  // 确认对话框
  confirmRequest: ActiveConfirmRequest | null
  onConfirmResolve: (id: string) => void
  /** 记住本次工作区搜索词，供下次打开同一知识库时填回。不保存正文。 */
  onRememberSearchQuery?: (query: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * 所有对话框/弹窗的统一渲染容器。
 *
 * 职责边界：
 * - 纯展示组件，所有状态和操作由父组件传入
 * - 每个对话框独立控制 open/close，互不干扰
 * - 集中管理弹窗渲染，避免 AppComposition JSX 膨胀
 *
 * 扩展方式：新增对话框只需添加 props 和对应的 JSX 块
 */
export function AppDialogs(props: AppDialogsProps): JSX.Element {
  const {
    settingsOpen, onCloseSettings, effectiveTheme, onThemeChange,
    workspace, workspaceSettings, onWorkspaceThemeEnabledChange,
    fontSize, onFontSizeChange, contentWidth, onContentWidthChange,
    lineHeight, onLineHeightChange, contentFont, onContentFontChange,
    zoom, onZoomChange, autosave, onAutosaveChange,
    typewriter, onTypewriterChange, spellcheck, onSpellcheckChange,
    spellcheckLang, onSpellcheckLangChange, multiWindow, onMultiWindowChange,
    blankClickToEnd, onBlankClickToEndChange, codeLineNumbers, onCodeLineNumbersChange,
    collapseFoldersOnOpen, onCollapseFoldersOnOpenChange,
    wordGoal, onWordGoalChange,
    customCssName, onImportCss, onRemoveCss,
    exportCssName, onImportExportCss, onRemoveExportCss,
    imageHost, onImageHostProviderChange, onImageHostTokenSave,
    globalAttachmentDirectory, onGlobalAttachmentDirectoryChange,
    workspaceAttachmentDirectory, onWorkspaceAttachmentDirectoryChange,
    shortcuts, onShortcutsChange,
    helpView, onCloseHelp, writingStats,
    imagesOpen, onCloseImages, imageDirs, setToast,
    pdfOptsOpen, onClosePdfOptions, onExportPdf,
    publishOpen, publishBusy, availableTags, onClosePublish, onExportBundle, onCopyRichText,
    paletteOpen, onClosePalette, recentFiles,
    onSelectWorkspaceFile, onSelectDemoFile, onRunCommand,
    commandRegistry, commandContext,
    versionHistoryOpen, onCloseVersionHistory,
    activeFilePath, activeFileName, currentContent, onRestoreVersion,
    wsSearchOpen, onCloseWorkspaceSearch, workspaceIndex, onSelectSearchResult,
    activeFileId, editorRef,
    confirmRequest, onConfirmResolve,
    onRememberSearchQuery,
  } = props
  const writingPlaceRef = useRef<EditorViewState | null>(null)
  const searchOpenRef = useRef(false)
  if (wsSearchOpen && !searchOpenRef.current) {
    writingPlaceRef.current = editorRef.current?.getViewState() ?? null
  }
  if (!wsSearchOpen) writingPlaceRef.current = null
  searchOpenRef.current = wsSearchOpen

  return (
    <>
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsDialog
            open={settingsOpen}
            onClose={onCloseSettings}
            theme={effectiveTheme}
            onThemeChange={onThemeChange}
            workspaceAvailable={workspace !== null}
            workspaceThemeEnabled={workspaceSettings.appearance.theme !== 'inherit'}
            onWorkspaceThemeEnabledChange={onWorkspaceThemeEnabledChange}
            fontSize={fontSize}
            onFontSizeChange={onFontSizeChange}
            contentWidth={contentWidth}
            onContentWidthChange={onContentWidthChange}
            lineHeight={lineHeight}
            onLineHeightChange={onLineHeightChange}
            contentFont={contentFont}
            onContentFontChange={onContentFontChange}
            zoom={zoom}
            onZoomChange={onZoomChange}
            autosave={autosave}
            onAutosaveChange={onAutosaveChange}
            typewriter={typewriter}
            onTypewriterChange={onTypewriterChange}
            spellcheck={spellcheck}
            onSpellcheckChange={onSpellcheckChange}
            spellcheckLang={spellcheckLang}
            onSpellcheckLangChange={onSpellcheckLangChange}
            multiWindow={multiWindow}
            onMultiWindowChange={onMultiWindowChange}
            blankClickToEnd={blankClickToEnd}
            onBlankClickToEndChange={onBlankClickToEndChange}
            codeLineNumbers={codeLineNumbers}
            onCodeLineNumbersChange={onCodeLineNumbersChange}
            collapseFoldersOnOpen={collapseFoldersOnOpen}
            onCollapseFoldersOnOpenChange={onCollapseFoldersOnOpenChange}
            wordGoal={wordGoal}
            onWordGoalChange={onWordGoalChange}
            customCssName={customCssName}
            onImportCss={onImportCss}
            onRemoveCss={onRemoveCss}
            exportCssName={exportCssName}
            onImportExportCss={onImportExportCss}
            onRemoveExportCss={onRemoveExportCss}
            imageHost={imageHost}
            onImageHostProviderChange={onImageHostProviderChange}
            onImageHostTokenSave={onImageHostTokenSave}
            globalAttachmentDirectory={globalAttachmentDirectory}
            onGlobalAttachmentDirectoryChange={onGlobalAttachmentDirectoryChange}
            workspaceAttachmentDirectory={workspaceAttachmentDirectory}
            onWorkspaceAttachmentDirectoryChange={onWorkspaceAttachmentDirectoryChange}
            shortcuts={shortcuts}
            onShortcutsChange={onShortcutsChange}
          >
          </SettingsDialog>
        </Suspense>
      )}
      {helpView && (
        <Suspense fallback={null}>
          <HelpDialog view={helpView} onClose={onCloseHelp} stats={writingStats} shortcuts={shortcuts} />
        </Suspense>
      )}
      {imagesOpen && (
        <Suspense fallback={null}>
          <ImagesDialog open={imagesOpen} onClose={onCloseImages} dirs={imageDirs} onNotify={setToast} />
        </Suspense>
      )}
      {pdfOptsOpen && (
        <Suspense fallback={null}>
          <ExportPdfDialog open={pdfOptsOpen} onClose={onClosePdfOptions} onExport={onExportPdf} />
        </Suspense>
      )}
      {publishOpen && (
        <Suspense fallback={null}>
          <PublishDialog
            open={publishOpen}
            busy={publishBusy}
            hasWorkspace={workspace !== null}
            availableTags={availableTags}
            onClose={onClosePublish}
            onExportBundle={onExportBundle}
            onCopyRichText={onCopyRichText}
          />
        </Suspense>
      )}
      <CommandPalette
        open={paletteOpen}
        workspace={workspace}
        recentFiles={recentFiles}
        onClose={onClosePalette}
        onSelectWorkspace={onSelectWorkspaceFile}
        onSelectDemo={onSelectDemoFile}
        onRunCommand={onRunCommand}
        commandRegistry={commandRegistry}
        commandContext={commandContext}
      />
      {versionHistoryOpen && (
        <Suspense fallback={null}>
          <VersionHistoryDialog
            open={versionHistoryOpen}
            filePath={activeFilePath}
            docName={activeFileName}
            currentContent={currentContent}
            onClose={onCloseVersionHistory}
            onRestore={onRestoreVersion}
          />
        </Suspense>
      )}
      {workspace && wsSearchOpen && (
        <Suspense fallback={null}>
          <WorkspaceSearchDialog
            open={wsSearchOpen}
            workspacePath={workspace.path}
            workspaceName={workspace.name}
            workspaceIndex={workspaceIndex}
            onClose={onCloseWorkspaceSearch}
            onSelect={onSelectSearchResult}
            activeFileId={activeFileId}
            initialQuery={workspaceSettings.editor.lastSearchQuery ?? ''}
            onQueryCommit={onRememberSearchQuery}
            onInsertCitation={(match) => {
              if (!citationTargetsCurrentDocument(match.capturedFileId, activeFileId)) {
                setToast('文档已切换，未把旧搜索结果插入当前文章')
                return
              }
              const editor = editorRef.current
              if (!editor) {
                setToast('编辑器尚未就绪，未插入引用')
                return
              }
              const place = writingPlaceRef.current
              if (place) editor.restoreViewState(place)
              editor.insertMd(buildSourceCitation(match.preview, activeFilePath, match.path))
              onCloseWorkspaceSearch()
              setToast('已插入来源引用，已回到原位置，可用撤销收回')
            }}
          />
        </Suspense>
      )}
      <ConfirmDialog
        request={confirmRequest}
        onResolve={onConfirmResolve}
      />
    </>
  )
}
