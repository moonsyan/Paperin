import type { JSX } from 'react'
import { FileIcon } from './SidebarIcons'

/** 快捷导航视图：null = 常规文件集合（树） */
export type QuickNavView = 'recent' | 'favorites' | null

export interface QuickNavEntry {
  key: string
  name: string
  path?: string
  demoId?: string
}

// ---------------------------------------------------------------------------
// 侧栏壳层三段：搜索触发框 · 快捷导航 · 底部区
// ---------------------------------------------------------------------------

export interface SidebarQuickNavProps {
  view: QuickNavView
  onViewChange: (view: QuickNavView) => void
  recentCount: number
  favoriteCount: number
  /** 点击搜索触发框：打开命令面板（复用既有命令注册表，不新增搜索逻辑） */
  onOpenSearch?: () => void
  /** 集合标题（工作区名 / 示例文档） */
  collectionName: string
  onCreateFile?: () => void
  /** 当前是否处于集合视图（快捷导航未选中时，标题为激活态） */
  collectionActive: boolean
  /** 搜索触发框的快捷键提示（由快捷键映射渲染，默认快速打开 Ctrl+P）；
   *  未绑定（null）时隐藏 <kbd> */
  searchShortcutHint?: string | null
}

const SearchIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
)

const ClockIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
)

const StarIcon = ({ filled = false }: { filled?: boolean }): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M12 4.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.9l5.4-.8z" />
  </svg>
)

/**
 * 侧栏上部导航区：搜索触发框 + 快捷导航（最近编辑 / 我的收藏）。
 *
 * 搜索是文件与命令的一等入口：点击即打开命令面板（注册表已有文件与命令两类，
 * 侧栏只负责触发，不复制任何搜索逻辑）。快捷导航以「视图切换」而非弹层呈现，
 * 与文件集合共享同一列表渲染，避免第二套导航堆叠。
 */
export function SidebarQuickNav({
  view,
  onViewChange,
  recentCount,
  favoriteCount,
  onOpenSearch,
  collectionName,
  onCreateFile,
  collectionActive,
  searchShortcutHint = null,
}: SidebarQuickNavProps): JSX.Element {
  const toggle = (next: Exclude<QuickNavView, null>) => () => onViewChange(view === next ? null : next)

  return (
    <div className="sidebar-nav">
      <button type="button" className="search-trigger" onClick={() => onOpenSearch?.()} aria-label="搜索文件与命令">
        <SearchIcon />
        <span>搜索文件与命令</span>
        {searchShortcutHint && <kbd>{searchShortcutHint}</kbd>}
      </button>

      <nav className="quick-nav" aria-label="快捷导航">
        <button
          type="button"
          className={`quick-nav-item ${view === 'recent' ? 'selected' : ''} ${recentCount === 0 ? 'is-empty' : ''}`}
          aria-pressed={view === 'recent'}
          onClick={toggle('recent')}
          title="最近编辑的文件"
        >
          <ClockIcon />
          <span className="quick-nav-label">最近编辑</span>
          <span className="nav-count">{recentCount}</span>
        </button>
        <button
          type="button"
          className={`quick-nav-item ${view === 'favorites' ? 'selected' : ''} ${favoriteCount === 0 ? 'is-empty' : ''}`}
          aria-pressed={view === 'favorites'}
          onClick={toggle('favorites')}
          title="我的收藏"
        >
          <StarIcon filled={favoriteCount > 0} />
          <span className="quick-nav-label">我的收藏</span>
          <span className="nav-count">{favoriteCount}</span>
        </button>
      </nav>

      <div className="collection-heading">
        <button
          type="button"
          className={`collection-name ${collectionActive ? 'selected' : ''}`}
          aria-current={collectionActive ? 'true' : undefined}
          onClick={() => onViewChange(null)}
          title={collectionName}
        >
          {collectionName}
        </button>
        {onCreateFile && (
          <button type="button" className="collection-action" onClick={() => onCreateFile()} aria-label="新建文件" title="新建文件">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 平面文件列表（最近编辑 / 我的收藏视图）
// ---------------------------------------------------------------------------

export interface SidebarFlatListProps {
  entries: QuickNavEntry[]
  activePath?: string | null
  emptyLabel: string
  onOpen: (entry: QuickNavEntry) => void
}

/** 与文件树共用行样式（.tree-row.tree-file-row），保证两种列表视觉一致 */
export function SidebarFlatList({ entries, activePath, emptyLabel, onOpen }: SidebarFlatListProps): JSX.Element {
  if (entries.length === 0) return <div className="tree-empty">{emptyLabel}</div>

  return (
    <div role="list" aria-label={emptyLabel}>
      {entries.map((entry) => {
        const active = Boolean(entry.path) && entry.path === activePath
        return (
          <div
            key={entry.key}
            role="listitem"
            className={`tree-row tree-file-row ${active ? 'active' : ''}`}
            title={entry.path ?? entry.name}
            tabIndex={0}
            onClick={() => onOpen(entry)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onOpen(entry)
            }}
          >
            <span className="tree-chevron-slot" />
            <FileIcon />
            <span className="tree-name">{entry.name}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 底部区
// ---------------------------------------------------------------------------

export interface SidebarFooterProps {
  /** 统计摘要：如「32 个文档」/「示例文档」 */
  summary: string
  onOpenSettings?: () => void
}

export function SidebarFooter({ summary, onOpenSettings }: SidebarFooterProps): JSX.Element {
  return (
    <div className="sidebar-footer">
      <span className="sidebar-footer-status">
        <span className="status-dot" aria-hidden="true" />
        {summary}
      </span>
      {onOpenSettings && (
        <button type="button" className="sidebar-footer-btn" onClick={() => onOpenSettings()} aria-label="打开设置" title="设置">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
      )}
    </div>
  )
}
