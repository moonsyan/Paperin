import { SettingsDialog } from '../components/SettingsDialog'
import { HelpDialog } from '../components/HelpDialog'
import type { HelpView, WritingStats } from '../components/HelpDialog'
import { ImagesDialog } from '../components/ImagesDialog'
import { ExportPdfDialog } from '../components/ExportPdfDialog'
import type { PdfOptions } from '../components/ExportPdfDialog'
import { PublishDialog } from '../components/PublishDialog'
import type { PublishOptions } from '../lib/export-bundle'
import type { PublishScope } from '../lib/export-bundle'
import { CommandPalette } from '../components/CommandPalette'
import { VersionHistoryDialog } from '../components/VersionHistoryDialog'
import { WorkspaceSearchDialog } from '../components/WorkspaceSearchDialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { ActiveConfirmRequest } from '../components/ConfirmDialog'
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
  // 确认对话框
  confirmRequest: ActiveConfirmRequest | null
  onConfirmResolve: (id: string) => void
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
    confirmRequest, onConfirmResolve,
  } = props

  return (
    <>
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
      />
      <HelpDialog view={helpView} onClose={onCloseHelp} stats={writingStats} shortcuts={shortcuts} />
      <ImagesDialog open={imagesOpen} onClose={onCloseImages} dirs={imageDirs} onNotify={setToast} />
      <ExportPdfDialog open={pdfOptsOpen} onClose={onClosePdfOptions} onExport={onExportPdf} />
      <PublishDialog
        open={publishOpen}
        busy={publishBusy}
        hasWorkspace={workspace !== null}
        availableTags={availableTags}
        onClose={onClosePublish}
        onExportBundle={onExportBundle}
        onCopyRichText={onCopyRichText}
      />
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
      <VersionHistoryDialog
        open={versionHistoryOpen}
        filePath={activeFilePath}
        docName={activeFileName}
        currentContent={currentContent}
        onClose={onCloseVersionHistory}
        onRestore={onRestoreVersion}
      />
      {workspace && (
        <WorkspaceSearchDialog
          open={wsSearchOpen}
          workspacePath={workspace.path}
          workspaceName={workspace.name}
          workspaceIndex={workspaceIndex}
          onClose={onCloseWorkspaceSearch}
          onSelect={onSelectSearchResult}
        />
      )}
      <ConfirmDialog
        request={confirmRequest}
        onResolve={onConfirmResolve}
      />
    </>
  )
}
