import type { ReactNode } from 'react'
import { MenuBar } from '../components/MenuBar'
import type { RecentFile } from '../components/MenuBar'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { WorkspaceContext } from '../components/WorkspaceShell'
import type { ShortcutMap } from '../data/shortcuts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppTopBarProps {
  sidebarCollapsed: boolean
  /** 切换侧栏；trigger 用于关闭抽屉后恢复焦点（T11） */
  onToggleSidebar: (trigger?: HTMLElement) => void
  focusMode: boolean
  onToggleFocusMode: () => void
  effectiveTheme: string
  onThemeChange: (theme: string) => void
  settingsOpen: boolean
  onOpenSettings: () => void
  onAction: (action: string) => void
  recentFiles: RecentFile[]
  shortcuts: ShortcutMap
  openFiles: Array<{ id: string; name: string }>
  docTitle: string
  titleRef: React.RefObject<HTMLDivElement>
  onTitleBlur: (event: React.FocusEvent<HTMLDivElement>) => void
  onTitleKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  /** 工作区上下文点：知识库名 + 本地/未打开标 */
  workspaceName: string
  workspacePath?: string | null
  /** 菜单灰显判断：由命令注册表的 scope + CommandContext 决定 */
  isActionEnabled?: (action: string) => boolean
  /** 中区标签栏（含知识图谱内置标签）；无打开文件时可不传 */
  tabs?: ReactNode
  /** 右区当前文件标识（来源 + 相对路径） */
  fileContext?: ReactNode
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * 应用顶栏（三区收敛）：左区（侧栏切换 + 品牌 + 菜单 + 工作区上下文点）·
 * 中区（标签栏）· 右区（当前文件标识 + 文档标题 + 操作按钮组）。
 *
 * 职责边界：
 * - 纯展示组件，所有状态和操作由父组件传入；标签栏与当前文件标识以插槽注入
 * - 文档标题 contentEditable 的 blur/keydown 事件委托给父组件处理
 */
export function AppTopBar({
  sidebarCollapsed,
  onToggleSidebar,
  focusMode,
  onToggleFocusMode,
  effectiveTheme,
  onThemeChange,
  settingsOpen,
  onOpenSettings,
  onAction,
  recentFiles,
  shortcuts,
  openFiles,
  docTitle,
  titleRef,
  onTitleBlur,
  onTitleKeyDown,
  workspaceName,
  workspacePath = null,
  isActionEnabled,
  tabs,
  fileContext,
}: AppTopBarProps): JSX.Element {
  return (
    <div className="topbar">
      <div className="topbar-zone-left">
        <button
          type="button"
          className={`act-btn ${!sidebarCollapsed ? 'active' : ''}`}
          onClick={(e) => onToggleSidebar(e.currentTarget)}
          aria-label="切换侧栏"
          aria-pressed={!sidebarCollapsed}
          title="切换侧栏 (Ctrl+J)"
        >
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
        </button>
        <div className="brand" title="MarkdownSoft">
          <img className="brand-icon" src="./icon.png" alt="" />
          <span className="brand-name">MarkdownSoft</span>
        </div>
        <MenuBar onAction={onAction} recentFiles={recentFiles} shortcuts={shortcuts} isActionEnabled={isActionEnabled} />
        {/* 库名常驻展示在侧栏标题（NEXT-UI-SPEC §3.1）；侧栏收起时顶栏才显示简短库名 */}
        <WorkspaceContext workspaceName={workspaceName} workspacePath={workspacePath} showName={sidebarCollapsed} />
      </div>

      <div className="topbar-zone-center">{tabs}</div>

      <div className="topbar-zone-right">
        {fileContext}
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
            onBlur={onTitleBlur}
            onKeyDown={onTitleKeyDown}
          >
            {docTitle}
          </div>
        )}
        <div className="act-group">
          <button
            type="button"
            className={`act-btn ${focusMode ? 'active' : ''}`}
            onClick={onToggleFocusMode}
            aria-label="切换专注模式"
            aria-pressed={focusMode}
            title="专注模式 (F11)"
          >
            <svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" /></svg>
          </button>
          <ThemeSwitcher currentTheme={effectiveTheme} onThemeChange={onThemeChange} />
          <button
            type="button"
            className={`act-btn ${settingsOpen ? 'active' : ''}`}
            onClick={onOpenSettings}
            aria-label="打开设置"
            title="设置"
          >
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
