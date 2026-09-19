import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkspaceInfo } from '../Sidebar'
import type { RecentFile } from '../MenuBar'
import { DEMO_FILES, DEMO_TREE } from '../../data/demo-files'
import { isImeComposing } from '../../lib/keyboard'
import {
  buildPaletteEntries,
  filterPaletteEntries,
  filterCommands,
  findNameMatchRange,
  PALETTE_RESULT_LIMIT,
} from '../../lib/command-palette'
import type { PaletteCommand, PaletteEntry } from '../../lib/command-palette'
import type { AppCommandRegistry } from '../../app/commands/app-command-registry'
import type { CommandContext } from '../../app/commands/command-context'
import { toPaletteCommands } from '../../app/commands/command-context'

interface CommandPaletteProps {
  open: boolean
  /** 当前工作区（null 时仅演示文件可跳转） */
  workspace: WorkspaceInfo | null
  /** 最近打开的磁盘文件（空查询时置顶展示） */
  recentFiles: RecentFile[]
  onClose: () => void
  /** 打开工作区文件；pinned=false 为预览标签，true 为固定标签 */
  onSelectWorkspace: (path: string, pinned: boolean) => void
  /** 打开演示文件，参数语义同上 */
  onSelectDemo: (id: string, pinned: boolean) => void
  /** 执行"> 动作模式"选中的命令（id 与菜单动作一致） */
  onRunCommand: (id: string) => void
  /** 可选的应用注册表；旧宿主未传入时继续使用内置命令清单。 */
  commandRegistry?: AppCommandRegistry | null
  commandContext?: CommandContext
}

const MAX_QUERY_LENGTH = 256

/** "> 命令"模式可执行的动作（id 与 MenuBar 菜单动作共用同一分发） */
const COMMANDS: PaletteCommand[] = [
  { id: 'new', label: '新建文档' },
  { id: 'newTemplate:readme', label: '新建文档模板：README' },
  { id: 'newTemplate:api', label: '新建文档模板：API 文档' },
  { id: 'newTemplate:design', label: '新建文档模板：设计文档' },
  { id: 'newTemplate:changelog', label: '新建文档模板：变更日志' },
  { id: 'newTemplate:article', label: '新建文档模板：技术文章' },
  { id: 'newTemplate:decision', label: '新建文档模板：决策记录' },
  { id: 'open', label: '打开文件' },
  { id: 'openFolder', label: '打开文件夹' },
  { id: 'save', label: '保存' },
  { id: 'wsSearch', label: '全工作区搜索' },
  { id: 'versionHistory', label: '版本历史' },
  { id: 'images', label: '图片管理' },
  { id: 'graph', label: '知识图谱' },
  { id: 'outline', label: '大纲面板' },
  { id: 'linksPanel', label: '关系面板' },
  { id: 'tagsPanel', label: '标签面板' },
  { id: 'propertiesPanel', label: '属性面板' },
  { id: 'qualityPanel', label: '检查面板' },
  { id: 'preview', label: '分栏预览' },
  { id: 'focusMode', label: '专注模式' },
  { id: 'toggleSidebar', label: '切换侧栏' },
  { id: 'settings', label: '设置' },
  { id: 'exportPdf', label: '导出 PDF' },
  { id: 'exportDocx', label: '导出 Word (.docx)' },
  { id: 'exportHtml', label: '导出 HTML' },
  { id: 'exportMarkdown', label: '导出 Markdown' },
]

/** 演示文件条目（模块级常量：DEMO_FILES/DEMO_TREE 为静态数据） */
const DEMO_ENTRIES: PaletteEntry[] = DEMO_TREE.flatMap((folder) =>
  folder.fileIds
    .filter((id) => DEMO_FILES[id])
    .map((id) => ({
      key: `demo:${id}`,
      kind: 'demo' as const,
      demoId: id,
      name: stripExt(DEMO_FILES[id].name),
      dir: folder.label,
    })),
)

function stripExt(name: string): string {
  return name.replace(/\.(md|markdown)$/i, '')
}

/** 展示名高亮首个命中片段 */
function HighlightName({ name, query }: { name: string; query: string }): JSX.Element {
  const range = findNameMatchRange(name, query)
  if (!range) return <>{name}</>
  return (
    <>
      {name.slice(0, range.start)}
      <mark className="ws-match">{name.slice(range.start, range.end)}</mark>
      {name.slice(range.end)}
    </>
  )
}

/**
 * 命令面板 / 快速打开：模糊匹配当前工作区文件名与演示文件，
 * 键盘 ↑↓ 选择、Enter 预览打开、Ctrl+Enter 固定打开、Esc 关闭。
 * 文件列表来自已加载的工作区树（不重新扫描磁盘），最近文件在空查询时置顶。
 */
export function CommandPalette({
  open,
  workspace,
  recentFiles,
  onClose,
  onSelectWorkspace,
  onSelectDemo,
  onRunCommand,
  commandRegistry = null,
  commandContext,
}: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 查询以 > 开头时进入命令模式：只列命令，Enter 执行
  const commandMode = query.trimStart().startsWith('>')

  // 命令模式查询词：去掉 > 前缀
  const commandQuery = query.replace(/^\s*>/, '')
  const commandEntries = useMemo(() => {
    if (!commandRegistry || !commandContext) return COMMANDS
    const registered = toPaletteCommands(commandRegistry.list(commandContext))
    const known = new Set(registered.map((command) => command.id))
    return [...registered, ...COMMANDS.filter((command) => !known.has(command.id))]
  }, [commandContext, commandRegistry])
  const filteredCommands = useMemo(
    () => filterCommands(commandEntries, commandQuery),
    [commandEntries, commandQuery],
  )

  const workspaceEntries = useMemo(
    () => buildPaletteEntries(workspace?.path, workspace?.tree),
    [workspace?.path, workspace?.tree],
  )

  // 空查询时最近文件置顶；可能包含不在当前树的文件（历史记录），仍可直接打开
  const recentEntries = useMemo<PaletteEntry[]>(
    () =>
      query.trim()
        ? []
        : recentFiles.slice(0, 10).map((r) => ({
            key: `recent:${r.path}`,
            kind: 'workspace' as const,
            path: r.path,
            name: stripExt(r.name),
            dir: '',
          })),
    [query, recentFiles],
  )

  const filteredWorkspace = useMemo(
    () => filterPaletteEntries(workspaceEntries, query, PALETTE_RESULT_LIMIT),
    [workspaceEntries, query],
  )
  const filteredRecent = useMemo(
    () => filterPaletteEntries(recentEntries, query, 10),
    [recentEntries, query],
  )
  const filteredDemo = useMemo(
    () => filterPaletteEntries(DEMO_ENTRIES, query, 20),
    [query],
  )

  const sections = useMemo(
    () => [
      { label: '最近打开', entries: filteredRecent },
      ...(workspace ? [{ label: '工作区文件', entries: filteredWorkspace }] : []),
      { label: '演示文件', entries: filteredDemo },
    ],
    [workspace, filteredRecent, filteredWorkspace, filteredDemo],
  )
  const flatItems = useMemo(() => sections.flatMap((s) => s.entries), [sections])

  // 模式切换（文件 ↔ 命令）时激活项归零，避免沿用另一模式的索引
  useEffect(() => {
    setActiveIndex(0)
  }, [commandMode])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
      return
    }
    inputRef.current?.focus()
  }, [open])

  // 查询变化或列表重算后收敛激活项，避免悬空索引。
  // 命令模式的激活列表是 filteredCommands 而非 flatItems，钳制必须跟随
  // 当前模式的列表长度，否则命令列表缩短后高亮项悬空、Enter 无响应
  const activeListLength = commandMode ? filteredCommands.length : flatItems.length
  useEffect(() => {
    setActiveIndex((idx) => (activeListLength === 0 ? 0 : Math.min(idx, activeListLength - 1)))
  }, [activeListLength])

  // 激活项滚动进可视区
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const el = list.querySelector<HTMLElement>(`.palette-item[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Esc 关闭（与全局快捷键互不干扰：弹窗打开期间 modalOpenRef 已屏蔽应用快捷键）
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (isImeComposing(e)) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const dialog = listRef.current?.parentElement
      if (!dialog) return
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>('input, button'))
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [open, onClose])

  if (!open) return null

  const openEntry = (entry: PaletteEntry, pinned: boolean) => {
    onClose()
    if (entry.kind === 'demo' && entry.demoId) onSelectDemo(entry.demoId, pinned)
    else if (entry.path) onSelectWorkspace(entry.path, pinned)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isImeComposing(e.nativeEvent)) return
    const listLength = commandMode ? filteredCommands.length : flatItems.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (listLength > 0) setActiveIndex((i) => (i + 1) % listLength)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (listLength > 0) setActiveIndex((i) => (i - 1 + listLength) % listLength)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (commandMode) {
        const cmd = filteredCommands[activeIndex]
        if (cmd) {
          onClose()
          onRunCommand(cmd.id)
        }
        return
      }
      const entry = flatItems[activeIndex]
      if (entry) openEntry(entry, e.ctrlKey || e.metaKey)
    }
  }

  let renderIndex = -1

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog palette-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="快速打开"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="palette-input-row">
          <input
            ref={inputRef}
            className="search-input palette-input"
            placeholder={workspace ? '输入文件名快速跳转；> 前缀执行命令' : '输入演示文件名快速跳转；> 前缀执行命令'}
            value={query}
            spellCheck={false}
            maxLength={MAX_QUERY_LENGTH}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            aria-label="快速打开：输入文件名，或 > 前缀执行命令"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={activeListLength > 0 ? `palette-option-${activeIndex}` : undefined}
          />
        </div>
        <div className="palette-results" id="command-palette-list" role="listbox" ref={listRef}>
          {commandMode ? (
            <>
              {filteredCommands.length === 0 && <div className="ws-empty">无匹配命令</div>}
              {filteredCommands.map((cmd, idx) => (
                <button
                  type="button"
                  key={cmd.id}
                  data-index={idx}
                  className={`palette-item${idx === activeIndex ? ' active' : ''}`}
                  role="option"
                  id={`palette-option-${idx}`}
                  aria-selected={idx === activeIndex}
                  title={cmd.id}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onClose()
                    onRunCommand(cmd.id)
                  }}
                >
                  <span className="palette-item-name">{cmd.label}</span>
                  <span className="palette-item-dir">命令</span>
                </button>
              ))}
            </>
          ) : (
            <>
              {flatItems.length === 0 && <div className="ws-empty">无匹配文件</div>}
              {sections.map((section) =>
                section.entries.length === 0 ? null : (
                  <div key={section.label} className="palette-group-wrap">
                    <div className="palette-group">{section.label}</div>
                    {section.entries.map((entry) => {
                      renderIndex += 1
                      const idx = renderIndex
                      return (
                        <button
                          type="button"
                          key={entry.key}
                          data-index={idx}
                          className={`palette-item${idx === activeIndex ? ' active' : ''}`}
                  role="option"
                  id={`palette-option-${idx}`}
                  aria-selected={idx === activeIndex}
                          title={entry.path ?? entry.name}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => openEntry(entry, false)}
                        >
                          <span className="palette-item-name">
                            <HighlightName name={entry.name} query={query} />
                          </span>
                          {entry.dir && <span className="palette-item-dir">{entry.dir}</span>}
                        </button>
                      )
                    })}
                  </div>
                ),
              )}
            </>
          )}
        </div>
        <div className="palette-hint">
          {commandMode ? (
            <>
              <span>↑↓ 选择</span>
              <span>Enter 执行</span>
              <span>Esc 关闭</span>
            </>
          ) : (
            <>
              <span>↑↓ 选择</span>
              <span>Enter 预览打开</span>
              <span>Ctrl+Enter 固定打开</span>
              <span>&gt; 切换命令模式</span>
              <span>Esc 关闭</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
