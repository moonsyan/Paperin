import { MenuBar } from '../components/MenuBar'
import type { RecentFile } from '../components/MenuBar'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import type { ShortcutMap } from '../data/shortcuts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AppTopBarProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * 应用顶栏：品牌区 + 菜单 + 文档标题（可编辑） + 操作按钮组。
 *
 * 职责边界：
 * - 纯展示组件，所有状态和操作由父组件传入
 * - 文档标题 contentEditable 的 blur/keydown 事件委托给父组件处理
 * - 操作按钮组：侧栏切换、专注模式、主题切换、设置
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
}: AppTopBarProps): JSX.Element {
  return (
    <div className="topbar">
      <div className="brand" title="MarkdownSoft">
        <img className="brand-icon" src="./icon.png" alt="" />
        <span className="brand-name">MarkdownSoft</span>
      </div>
      <MenuBar onAction={onAction} recentFiles={recentFiles} shortcuts={shortcuts} />
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
          onBlur={onTitleBlur}
          onKeyDown={onTitleKeyDown}
        >
          {docTitle}
        </div>
      )}
      <div className="act-group">
        <button
          type="button"
          className={`act-btn ${!sidebarCollapsed ? 'active' : ''}`}
          onClick={onToggleSidebar}
          aria-label="切换侧栏"
          aria-pressed={!sidebarCollapsed}
          title="切换侧栏 (Ctrl+J)"
        >
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>
        </button>
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
  )
}
