import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  buildDemoFileTree,
  buildWorkspaceFileTree,
  filterTreeByPaths,
  type UiNode,
} from './fileTree'
import { clampMenuPosition } from '../../lib/menu-position'
import type { SidebarProps } from './types'
import { collectExternalOpenFiles } from './sidebar-file-model'
import { SidebarContextMenu, type SidebarContextMenuState } from './SidebarContextMenu'
import { SidebarTree } from './SidebarTree'
import { SidebarFlatList, SidebarFooter, SidebarQuickNav } from './SidebarQuickNav'
import type { QuickNavEntry, QuickNavView } from './SidebarQuickNav'
import { useSidebarCollapse } from './useSidebarCollapse'
import { sharedPanelRegistry } from '../../app/panels/shared-panel-registry'
import type { PanelContext, PanelDefinition } from '../../app/panels/panel-registry'

export type { OpenFile, SidebarProps, WorkspaceInfo } from './types'

/* Sidebar 主区域由 PanelRegistry 的 sidebar.primary 插槽驱动：内置 files 面板
 * 渲染文件树，扩展面板经 render(context) 追加。二级面板注册在 ContextDock，
 * 生命周期与键盘焦点保持独立。
 *
 * 五段式信息架构（quiet-workspace）：搜索触发框 → 快捷导航（最近编辑/我的收藏）
 * → 集合标题 → 文件树 → 底部区。搜索只触发命令面板，不复制搜索逻辑。
 *
 * 职责拆分：折叠记录在 useSidebarCollapse，树与行级交互在 SidebarTree，
 * 导航与底部区在 SidebarQuickNav，本组件只负责树数据建模、右键菜单与视图编排。 */

/** 内置 files 面板的 id（未注册或自带 render 时文件树不出现） */
export const FILES_PANEL_ID = 'files'

const baseName = (path: string): string => path.split(/[\\/]/).pop() || path

export function Sidebar({
  demoTree,
  demoFileNames,
  workspace,
  openFiles,
  activeFileId,
  onSelectDemoFile,
  onSelectWorkspaceFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onMoveFile,
  onOpenInNewWindow,
  initialCollapsedKeys,
  onCollapsedKeysChange,
  collapseFoldersOnOpen = true,
  tagFilter = null,
  onClearTagFilter,
  collapsed = false,
  registry = sharedPanelRegistry,
  onOpenSearch,
  recentFiles = [],
  favorites = [],
  onToggleFavorite,
  onOpenSettings,
}: SidebarProps): JSX.Element {
  // 右键菜单与内联重命名
  const [ctxMenu, setCtxMenu] = useState<SidebarContextMenuState | null>(null)
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // 快捷导航视图：null = 常规文件集合（树）
  const [quickView, setQuickView] = useState<QuickNavView>(null)

  // L16：折叠时不卸载组件，只把宽度缩到 0（保留滚动位置/重命名状态）。
  // inert 阻止 Tab 聚焦到被裁切的内容（React 18 不识别 inert prop，用 ref 设置）。
  const sidebarRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = sidebarRef.current
    if (!el) return
    if (collapsed) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [collapsed])

  // 切换工作区后快捷导航回到集合视图，避免停留在上个工作区的收藏列表
  useEffect(() => { setQuickView(null) }, [workspace?.path])

  const closeCtxMenu = useCallback((restoreFocus = false) => {
    const trigger = ctxMenu?.trigger
    setCtxMenu(null)
    if (restoreFocus) trigger?.focus()
  }, [ctxMenu])

  // 点击其他区域关闭右键菜单；Escape 关闭并把焦点还给触发右键的行。
  useEffect(() => {
    if (!ctxMenu) return
    const handleClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.tree-ctx-menu')) {
        closeCtxMenu()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeCtxMenu(true)
      }
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeCtxMenu, ctxMenu])

  /* ==================== 文件树数据 ==================== */

  // 演示树归一化为 UiNode
  const demoNodes = useMemo(
    () => buildDemoFileTree(demoTree, demoFileNames),
    [demoTree, demoFileNames],
  )

  // 工作区树归一化为 UiNode
  const workspaceNodes = useMemo<UiNode[]>(
    () => (
      workspace
        ? buildWorkspaceFileTree(workspace.path, workspace.tree, workspace.name)
        : []
    ),
    [workspace],
  )

  // 标签筛选后的展示树：只保留含该标签的文件与祖先文件夹。
  // 注意折叠状态仍取自未筛选的 workspaceNodes，不随筛选变化。
  // files 视图不做索引交集过滤：索引有 2000 上限且跳过 >2MB 文件，
  // 按它过滤会让这些文件从树里静默消失（索引候选列表本身就来自同一棵树，
  // 目录可见性规则一致，直接展示完整树即是正确口径）
  const visibleWorkspaceNodes = useMemo<UiNode[]>(
    () =>
      tagFilter
        ? filterTreeByPaths(workspaceNodes, new Set(tagFilter.paths))
        : workspaceNodes,
    [workspaceNodes, tagFilter],
  )

  const externalNodes = useMemo<UiNode[]>(
    () => collectExternalOpenFiles(openFiles, workspace?.path ?? null).map((file) => ({
      key: `external:${file.id}`,
      name: file.name,
      kind: 'file',
      path: file.path,
    })),
    [openFiles, workspace?.path],
  )

  /* ==================== 快捷导航数据 ==================== */

  const recentEntries = useMemo<QuickNavEntry[]>(
    () => recentFiles.map((file) => ({ key: `recent:${file.path}`, name: file.name || baseName(file.path), path: file.path })),
    [recentFiles],
  )

  const favoriteEntries = useMemo<QuickNavEntry[]>(
    () => favorites.map((path) => ({ key: `fav:${path}`, name: baseName(path), path })),
    [favorites],
  )

  const activeFilePath = useMemo(
    () => openFiles.find((file) => file.id === activeFileId)?.path ?? null,
    [activeFileId, openFiles],
  )

  // 折叠记录与级联切换（作用域解析在 App 完成）
  const treeNodes = workspace ? workspaceNodes : demoNodes
  const { collapsedKeys, toggleCollapse } = useSidebarCollapse({
    initialCollapsedKeys,
    collapseFoldersOnOpen,
    treeNodes,
    onCollapsedKeysChange,
  })

  /* ==================== 渲染：文件树 ==================== */

  /** 右键打开上下文菜单（仅工作区节点）；位置按视口收拢避免边缘溢出 */
  const openCtxMenu = (e: React.MouseEvent, node: UiNode) => {
    if (!workspace || !node.path) return
    e.preventDefault()
    const pos = clampMenuPosition(e.clientX, e.clientY)
    setCtxMenu({ x: pos.x, y: pos.y, node, trigger: e.currentTarget as HTMLElement })
  }

  const openTreeFile = (node: UiNode, pinned: boolean) => {
    // 从搜索结果点选文件时，搜索输入框持有焦点会挡住编辑器焦点恢复（H2），先释放
    const active = document.activeElement as HTMLElement | null
    if (active && active !== document.body && active.closest('input, textarea')) {
      active.blur()
    }
    if (node.demoId !== undefined) {
      onSelectDemoFile(node.demoId, pinned)
      return
    }
    if (node.path) onSelectWorkspaceFile(node.path, pinned)
  }

  const treeProps = {
    interactive: Boolean(workspace),
    activeFileId,
    collapsedKeys,
    onToggleCollapse: toggleCollapse,
    onOpenFile: openTreeFile,
    onContextMenu: openCtxMenu,
    onMoveFile,
    renamingKey,
    renameValue,
    onRenameValueChange: setRenameValue,
    onRenameCommit: (node: UiNode, value: string) => {
      if (node.path && value.trim()) onRenameFile?.(node.path, value)
      setRenamingKey(null)
    },
    onRenameCancel: () => setRenamingKey(null),
  }

  /* ==================== 渲染：主区域面板 ==================== */

  // sidebar.primary 插槽由注册表驱动：内置 files 面板渲染文件树；
  // 扩展面板（自带 render）按注册顺序追加到文件树之后
  const panelContext: PanelContext = { activeFileId, hasWorkspace: Boolean(workspace) }
  const primaryPanels = registry.list('sidebar.primary', panelContext)

  const renderPrimaryPanel = (panel: PanelDefinition): JSX.Element | null => {
    if (panel.render) {
      return (
        <div key={panel.id} className="panel active sidebar-custom-panel" role="tabpanel" aria-label={panel.title}>
          {panel.render(panelContext)}
        </div>
      )
    }
    if (panel.id !== FILES_PANEL_ID) return null
    return (
      <div key={panel.id} className="panel active" role="tabpanel" aria-label={panel.title}>
        {tagFilter && (
          <div className="tree-filter-banner">
            <span className="tree-filter-label">#{tagFilter.tag}（{tagFilter.paths.length}）</span>
            <button type="button" className="tree-filter-clear" onClick={() => onClearTagFilter?.()} aria-label="清除标签筛选" title="清除标签筛选">✕</button>
          </div>
        )}
        <div role="tree" aria-label="文件列表">
          {workspace ? (
            visibleWorkspaceNodes.length > 0
              ? <SidebarTree nodes={visibleWorkspaceNodes} {...treeProps} />
              : <div className="tree-empty">{tagFilter ? '没有包含该标签的文件' : '文件夹为空，已新建空白文档'}</div>
          ) : <SidebarTree nodes={demoNodes} {...treeProps} />}
          {externalNodes.length > 0 && (
            <div className="tree-external-group" role="group" aria-label="外部文件">
              <div className="tree-section-label">外部文件</div>
              <SidebarTree nodes={externalNodes} {...treeProps} />
            </div>
          )}
        </div>
      </div>
    )
  }

  const collectionName = workspace ? workspace.name : '示例文档'
  const summary = workspace
    ? `${workspaceNodes.length} 个文档`
    : `${demoNodes.length} 个示例`

  return (
    <aside
      ref={sidebarRef}
      id="workspace-file-sidebar"
      className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-label="文件侧栏"
      aria-hidden={collapsed}
    >
      <SidebarQuickNav
        view={quickView}
        onViewChange={setQuickView}
        recentCount={recentEntries.length}
        favoriteCount={favoriteEntries.length}
        onOpenSearch={onOpenSearch}
        collectionName={collectionName}
        collectionActive={quickView === null}
        onCreateFile={onCreateFile && workspace ? () => onCreateFile(workspace.path) : undefined}
      />

      <div className="sidebar-body">
        {quickView === 'recent' ? (
          <SidebarFlatList
            entries={recentEntries}
            activePath={activeFilePath}
            emptyLabel="最近编辑"
            onOpen={(entry) => { if (entry.path) onSelectWorkspaceFile(entry.path, false) }}
          />
        ) : quickView === 'favorites' ? (
          <SidebarFlatList
            entries={favoriteEntries}
            activePath={activeFilePath}
            emptyLabel="我的收藏"
            onOpen={(entry) => { if (entry.path) onSelectWorkspaceFile(entry.path, false) }}
          />
        ) : (
          primaryPanels.map((panel) => renderPrimaryPanel(panel))
        )}
      </div>

      <SidebarFooter summary={summary} onOpenSettings={onOpenSettings} />

      {/* ===== 右键上下文菜单（工作区文件操作） ===== */}
      {ctxMenu && (
        <SidebarContextMenu
          state={ctxMenu}
          onClose={closeCtxMenu}
          onCreateFile={onCreateFile}
          onStartRename={(node) => {
            setRenamingKey(node.key)
            setRenameValue(node.name)
          }}
          onOpenInNewWindow={onOpenInNewWindow}
          onDeleteFile={onDeleteFile}
          isFavorite={(path) => favorites.includes(path)}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    </aside>
  )
}
