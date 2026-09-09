import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import type { DemoFolder } from '../../data/demo-files'
import type { FolderTreeNode } from '../../../../preload/api'
import { isImeComposing } from '../../lib/keyboard'
import {
  buildDemoFileTree,
  buildWorkspaceFileTree,
  collectFolderKeys,
  collectFolderKeysUnder,
  findNodeByKey,
  type UiNode,
} from './fileTree'
import { OutlinePanel } from './OutlinePanel'
import { BacklinksPanel } from './BacklinksPanel'
import { TagsPanel } from './TagsPanel'
import { filterTreeByPaths } from './fileTree'
import { clampMenuPosition } from '../../lib/menu-position'
import type { BacklinkGraph } from '../../lib/backlinks'
import type { WorkspaceTagIndexEntry } from '../../../../shared/tag-index'
import type { SidebarView } from '../../../../shared/workspace-state'
import type { DiagnosticRecord, WorkspaceIndex } from '../../../../shared/workspace-index'
import type { TypographyIssue } from '../../lib/chinese-typography'
import { QualityPanel } from '../QualityPanel'
import { buildSidebarViewModel } from './sidebar-view-model'

/** 打开中的文档（含真实文件的磁盘路径） */
export interface OpenFile {
  id: string
  name: string
  /** 磁盘路径（真实文件才有，演示文件为空） */
  path?: string
  /** 侧栏单击打开的临时预览标签；双击或首次修改后转为固定标签 */
  preview?: boolean
  /** 用户明确固定的标签；固定标签位于普通标签之前，批量关闭时保留 */
  pinned?: boolean
}

/** 已打开的工作区文件夹 */
export interface WorkspaceInfo {
  path: string
  name: string
  tree: FolderTreeNode[]
}

interface SidebarProps {
  /** 演示文件树结构 */
  demoTree: DemoFolder[]
  /** 演示文件名映射（id → 显示名） */
  demoFileNames: Record<string, string>
  /** 打开的工作区文件夹（可为空） */
  workspace: WorkspaceInfo | null
  /** 当前打开的所有文件（用于展示树外的外部文件） */
  openFiles: OpenFile[]
  /** 当前激活的文件 ID */
  activeFileId: string
  /** 当前文档 Markdown（用于生成大纲） */
  content: string
  /** 点击演示文件；固定标签由双击触发 */
  onSelectDemoFile: (id: string, pinned: boolean) => void
  /** 点击工作区/磁盘文件（传路径）；固定标签由双击触发 */
  onSelectWorkspaceFile: (path: string, pinned: boolean) => void
  /** 点击大纲标题（index 为标题在文档中的顺序） */
  onOutlineClick: (index: number) => void
  /** 该值变化时自动切到大纲 Tab（用于"视图 → 大纲面板"菜单） */
  focusOutlineTick?: number
  /** 当前光标所在标题索引（大纲跟随高亮，-1 无） */
  activeOutlineIndex?: number
  /** 工作区文件操作（仅工作区模式下有效） */
  onCreateFile?: (dirPath: string) => void
  onRenameFile?: (path: string, newName: string) => void
  onDeleteFile?: (path: string) => void
  /** 拖拽移动文件/文件夹到目标目录（U5） */
  onMoveFile?: (path: string, targetDir: string) => void
  /** 右键在新窗口打开文件（U7） */
  onOpenInNewWindow?: (path: string) => void
  /** 初始折叠键列表（持久化恢复）；null = 无记录，由 collapseFoldersOnOpen 决定初始态（on 全折叠 / off 全展开） */
  initialCollapsedKeys?: string[] | null
  /** 折叠键变化回调 */
  onCollapsedKeysChange?: (keys: string[]) => void
  /** 默认打开文件夹全部折叠：开启后折叠某文件夹会一并折叠其子文件夹，且初始全部折叠 */
  collapseFoldersOnOpen?: boolean
  /** 当前活动标签页 */
  activeTab?: SidebarView
  /** 标签页切换回调 */
  onActiveTabChange?: (tab: SidebarView) => void
  /** 反链面板数据（工作区链接图谱；null = 未建索引/无工作区） */
  linkGraph?: BacklinkGraph | null
  /** 反链面板针对的当前文件路径（null = 演示文件/未保存文档） */
  activeLinkPath?: string | null
  /** 链接索引是否在加载 */
  linksLoading?: boolean
  /** 链接索引是否被规模守卫截断 */
  linksTruncated?: boolean
  /** 点击反链/出链条目打开对应文件（query 接力文档内搜索） */
  onOpenLink?: (path: string, query: string) => void
  /** 点击未解析目标 */
  onUnresolvedLinkClick?: (target: string) => void
  /** 打开知识图谱视图 */
  onOpenGraphView?: () => void
  /** 逐文件标签索引（null = 未建索引/无工作区） */
  tagsFiles?: WorkspaceTagIndexEntry[] | null
  /** 标签索引是否在加载 */
  tagsLoading?: boolean
  /** 标签索引是否被规模守卫截断 */
  tagsTruncated?: boolean
  /** 当前标签筛选（null = 未筛选）；文件树只显示含该标签的文件 */
  tagFilter?: { tag: string; paths: string[] } | null
  /** 点击标签切换文件树筛选 */
  onToggleTagFilter?: (tag: string) => void
  /** 清除标签筛选 */
  onClearTagFilter?: () => void
  workspaceIndex?: WorkspaceIndex | null
  diagnostics?: DiagnosticRecord[]
  indexLoading?: boolean
  onRefreshIndex?: () => void
  onCancelIndex?: () => void
  onOpenDiagnostic?: (diagnostic: DiagnosticRecord) => void
  /** 当前文档中文排版问题（活动文档内容实时检查，非工作区索引） */
  typographyIssues?: TypographyIssue[]
  /** 点击排版问题定位到所在行 */
  onOpenTypographyIssue?: (issue: TypographyIssue) => void
  /** 一键修复当前文档排版问题 */
  onFixTypography?: () => void
  /**
   * L16：折叠时不卸载组件（保留滚动位置/重命名状态），只缩到宽度 0。
   * 折叠期间用 inert 阻止 Tab 聚焦被裁切的内容。
   */
  collapsed?: boolean
}

/* ==================== 小图标 ==================== */

function ChevronIcon({ open }: { open: boolean }): JSX.Element {
  return (
    <svg className={`tree-chevron ${open ? 'open' : ''}`} viewBox="0 0 24 24">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function FolderIcon(): JSX.Element {
  return (
    <svg className="tree-icon tree-icon-folder" viewBox="0 0 24 24">
      <path d="M3 7a2 2 0 0 1 2-2h4.2a1 1 0 0 1 .8.4L11.6 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

function FileIcon(): JSX.Element {
  return (
    <svg className="tree-icon tree-icon-file" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

export function Sidebar({
  demoTree,
  demoFileNames,
  workspace,
  activeFileId,
  content,
  onSelectDemoFile,
  onSelectWorkspaceFile,
  onOutlineClick,
  focusOutlineTick: _focusOutlineTick = 0,
  activeOutlineIndex = -1,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  onMoveFile,
  onOpenInNewWindow,
  initialCollapsedKeys,
  onCollapsedKeysChange,
  collapseFoldersOnOpen = true,
  activeTab: _controlledTab,
  onActiveTabChange: _onActiveTabChange,
  linkGraph = null,
  activeLinkPath = null,
  linksLoading = false,
  linksTruncated = false,
  onOpenLink,
  onUnresolvedLinkClick,
  onOpenGraphView,
  tagsFiles = null,
  tagsLoading = false,
  tagsTruncated = false,
  tagFilter = null,
  onToggleTagFilter,
  onClearTagFilter,
  workspaceIndex = null,
  diagnostics = [],
  indexLoading = false,
  onRefreshIndex,
  onCancelIndex,
  onOpenDiagnostic,
  typographyIssues,
  onOpenTypographyIssue,
  onFixTypography,
  collapsed = false,
}: SidebarProps): JSX.Element {
  const activeTab = 'files' as SidebarView
  const setActiveTab = useCallback((_tab: SidebarView) => undefined, [])
  const sidebarViewModel = useMemo(
    () => workspaceIndex ? buildSidebarViewModel(workspaceIndex, activeLinkPath, activeTab) : null,
    [workspaceIndex, activeLinkPath, activeTab],
  )
  const sidebarTagFiles = useMemo(
    () => {
      if (!sidebarViewModel) return tagsFiles
      if (sidebarViewModel.view !== 'tags') return tagsFiles
      const tagPaths = new Set(sidebarViewModel.tags.flatMap((tag) => tag.paths))
      return Array.from(tagPaths, (path) => ({ path, mtimeMs: 0, size: 0, tags: sidebarViewModel.tags.filter((tag) => tag.paths.includes(path)).map((tag) => tag.name) }))
    },
    [sidebarViewModel, tagsFiles],
  )
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(
    () => new Set(initialCollapsedKeys ?? []),
  )
  // 右键菜单与内联重命名
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: UiNode } | null>(null)
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // 文件树拖拽移动（U5）：正在拖动的节点与当前悬停的投放目标
  const [dragNode, setDragNode] = useState<{ path: string; kind: 'file' | 'folder' } | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)

  // L16：折叠时不卸载组件，只把宽度缩到 0（保留滚动位置/重命名状态）。
  // inert 阻止 Tab 聚焦到被裁切的内容（React 18 不识别 inert prop，用 ref 设置）。
  const sidebarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sidebarRef.current
    if (!el) return
    if (collapsed) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [collapsed])

  /** 判断当前拖动的节点能否放入目标文件夹 */
  const canDropInto = (target: UiNode): boolean => {
    if (!dragNode || !target.path || target.kind !== 'folder') return false
    const src = dragNode.path
    // 不能移入自身或自身的子目录
    if (target.path === src) return false
    if (target.path.startsWith(src + '/') || target.path.startsWith(src + '\\')) return false
    // 已在目标目录下，无需移动
    if (src.replace(/[\\/][^\\/]+$/, '') === target.path) return false
    return true
  }

  // 点击其他区域关闭右键菜单
  useEffect(() => {
    if (!ctxMenu) return
    const handler = () => setCtxMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [ctxMenu])

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
  // 注意 allFolderKeys 仍取自未筛选的 workspaceNodes，折叠状态不随筛选变化。
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

  /** 收集当前渲染树的全部文件夹 key（演示树或工作区树，含嵌套子文件夹） */
  const allFolderKeys = useMemo(
    () => collectFolderKeys(workspace ? workspaceNodes : demoNodes),
    [workspace, workspaceNodes, demoNodes],
  )
  /** 折叠状态应用：记录由 App 按树作用域（工作区路径/演示树）解析后传入——
   *  null = 当前树无记录（新打开的工作区/从未折叠过）→ 全部折叠；
   *  有记录 → 原样恢复。作用域解析在 App 完成，这里不再做”记录匹配”判定
   *  （旧逻辑把空数组记录误判为匹配当前树，新工作区被全部平铺展开）。
   *  注意：本 effect 不写回记录（折叠全部是幂等的，无需持久化）；
   *  用户手动折叠/展开时 onCollapsedKeysChange 实时写回当前作用域。 */
  const appliedCollapseRef = useRef<{
    keys: string[] | null | undefined
    treeSig: string
    collapse: boolean
  } | null>(null)
  useEffect(() => {
    if (allFolderKeys.length === 0) return
    const treeSig = allFolderKeys.join('\u0000')
    const prev = appliedCollapseRef.current
    // 记录引用与树结构、折叠开关都未变时不重算（设置异步加载完成后记录到达、
    // 更换工作区、切换折叠开关、用户手动折叠/展开时才会变化）
    if (
      prev &&
      prev.treeSig === treeSig &&
      prev.keys === initialCollapsedKeys &&
      prev.collapse === collapseFoldersOnOpen
    ) {
      return
    }
    appliedCollapseRef.current = { keys: initialCollapsedKeys, treeSig, collapse: collapseFoldersOnOpen }
    // 修复：用户展开文件夹后被立即重新折叠。
    // 有持久记录时严格沿用记录（用户上次的折叠/展开态），不受开关影响；
    // 记录因 onCollapsedKeysChange 写回产生新引用时，不再误判为“无记录”而全部折叠。
    // 无记录时按「默认打开文件夹全部折叠」开关决定初始态：on → 全部折叠，off → 全部展开。
    setCollapsedKeys(
      initialCollapsedKeys == null
        ? collapseFoldersOnOpen
          ? new Set(allFolderKeys)
          : new Set<string>()
        : new Set(initialCollapsedKeys),
    )
  }, [initialCollapsedKeys, allFolderKeys, collapseFoldersOnOpen])

  /**
   * 切换折叠状态：
   *  - 点击展开：仅展开被点击的文件夹，子目录保持原状（不强制展开）。
   *  - 点击折叠：本文件夹及其所有后代文件夹一并折叠。
   * 级联折叠与初始开关（`collapseFoldersOnOpen`）独立——开关仅控制打开工作区
   * 时的初始状态；交互行为按本规范固定为「点折叠全级联、点展开只动自身」。
   */
  const toggleCollapse = (key: string) => {
    const treeNodes = workspace ? workspaceNodes : demoNodes
    // 在 updater 外基于当前状态算好 next，再一次性提交与写回，
    // 避免把回调副作用放进 updater（StrictMode 下 updater 会执行两次）
    const next = new Set(collapsedKeys)
    if (next.has(key)) {
      // 展开：仅展开被点击的文件夹，子文件夹保持原状
      next.delete(key)
    } else {
      // 折叠：本文件夹及其所有后代文件夹一并折叠
      next.add(key)
      const target = findNodeByKey(treeNodes, key)
      if (target) {
        for (const k of collectFolderKeysUnder(target)) {
          if (k !== key) next.add(k)
        }
      }
    }
    setCollapsedKeys(next)
    onCollapsedKeysChange?.(Array.from(next))
  }

  /* ==================== 渲染：文件树 ==================== */

  /** 右键打开上下文菜单（仅工作区节点）；位置按视口收拢避免边缘溢出 */
  const openCtxMenu = (e: React.MouseEvent, node: UiNode) => {
    if (!workspace || !node.path) return
    e.preventDefault()
    const pos = clampMenuPosition(e.clientX, e.clientY)
    setCtxMenu({ x: pos.x, y: pos.y, node })
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

  const renderTreeNode = (node: UiNode, depth: number): JSX.Element => {
    const indent = 8 + depth * 14
    // 层级引导线：每个祖先层级一条竖线（与箭头列对齐）
    const guides: JSX.Element[] = []
    for (let i = 0; i < depth; i++) {
      guides.push(
        <span key={i} className="tree-guide" style={{ left: 8 + i * 14 + 5 }} />,
      )
    }
    if (node.kind === 'folder') {
      const open = !collapsedKeys.has(node.key)
      // 工作区文件夹支持拖入移动（U5）
      const droppable = !!workspace && !!node.path
      return (
        <div key={node.key} role="none">
          <div
            className={`tree-row tree-folder-row ${dropKey === node.key ? 'drop-target' : ''}`}
            style={{ paddingLeft: indent }}
            role="treeitem"
            tabIndex={0}
            aria-expanded={open}
            onClick={() => toggleCollapse(node.key)}
            onKeyDown={(event) => {
              if (isImeComposing(event.nativeEvent)) return
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              toggleCollapse(node.key)
            }}
            onContextMenu={(e) => openCtxMenu(e, node)}
            draggable={droppable}
            onDragStart={(e) => {
              if (!node.path) return
              setDragNode({ path: node.path, kind: node.kind })
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', node.name)
            }}
            onDragEnd={() => {
              setDragNode(null)
              setDropKey(null)
            }}
            onDragOver={(e) => {
              if (canDropInto(node)) {
                e.preventDefault()
                e.stopPropagation()
                setDropKey(node.key)
              }
            }}
            onDragLeave={() => setDropKey((k) => (k === node.key ? null : k))}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (dragNode && canDropInto(node) && node.path) {
                onMoveFile?.(dragNode.path, node.path)
              }
              setDragNode(null)
              setDropKey(null)
            }}
          >
            {guides}
            <ChevronIcon open={open} />
            <FolderIcon />
            <span className="tree-name">{node.name}</span>
          </div>
          {open && (
            <div role="group">
              {node.children?.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      )
    }
    const isActive =
      node.demoId !== undefined
        ? activeFileId === node.demoId
        : activeFileId === `file-${node.path}`
    // 内联重命名态
    if (renamingKey === node.key && node.path) {
      return (
        <div
          key={node.key}
          className="tree-row tree-file-row"
          style={{ paddingLeft: indent }}
        >
          {guides}
          <span className="tree-chevron-slot" />
          <FileIcon />
          <input
            className="tree-rename-input"
            autoFocus
            value={renameValue}
            spellCheck={false}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (isImeComposing(e.nativeEvent)) return
              if (e.key === 'Enter') {
                e.preventDefault()
                if (node.path && renameValue.trim()) {
                  onRenameFile?.(node.path, renameValue)
                }
                setRenamingKey(null)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setRenamingKey(null)
              }
            }}
            onBlur={() => setRenamingKey(null)}
          />
        </div>
      )
    }
    return (
      <div
        key={node.key}
        className={`tree-row tree-file-row ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: indent }}
        role="treeitem"
        tabIndex={0}
        aria-selected={isActive}
        onClick={() => openTreeFile(node, false)}
        onDoubleClick={() => openTreeFile(node, true)}
        onKeyDown={(event) => {
          if (isImeComposing(event.nativeEvent)) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          openTreeFile(node, false)
        }}
        onContextMenu={(e) => openCtxMenu(e, node)}
        draggable={!!workspace && !!node.path}
        onDragStart={(e) => {
          if (!node.path) return
          setDragNode({ path: node.path, kind: node.kind })
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', node.name)
        }}
        onDragEnd={() => {
          setDragNode(null)
          setDropKey(null)
        }}
      >
        {guides}
        <span className="tree-chevron-slot" />
        <FileIcon />
        <span className="tree-name">{node.name}</span>
      </div>
    )
  }

  /* ==================== 渲染：大纲 ==================== */

  return (
    <div
      ref={sidebarRef}
      className={`sidebar ${collapsed ? 'collapsed' : ''}`}
      aria-hidden={collapsed}
    >
      {/* Tab 切换 */}
      <div className="sidebar-tabs" role="tablist" aria-label="侧栏视图">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'files'}
          aria-controls="sidebar-files-panel"
          className={`sidebar-tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          文件
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'quality'} aria-controls="sidebar-quality-panel" className={`sidebar-tab ${activeTab === 'quality' ? 'active' : ''}`} onClick={() => setActiveTab('quality')}>质量</button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'outline'}
          aria-controls="sidebar-outline-panel"
          className={`sidebar-tab ${activeTab === 'outline' ? 'active' : ''}`}
          onClick={() => setActiveTab('outline')}
        >
          大纲
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'links'}
          aria-controls="sidebar-links-panel"
          className={`sidebar-tab ${activeTab === 'links' ? 'active' : ''}`}
          onClick={() => setActiveTab('links')}
        >
          链接
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tags'}
          aria-controls="sidebar-tags-panel"
          className={`sidebar-tab ${activeTab === 'tags' ? 'active' : ''}`}
          onClick={() => setActiveTab('tags')}
        >
          标签
        </button>
      </div>

      <div className="sidebar-body">
        {/* ===== 文件树面板 ===== */}
        {activeTab === 'files' && (
          <div
            id="sidebar-files-panel"
            className="panel active"
            role="tabpanel"
            aria-label="文件"
          >
            {/* 已打开工作区：只显示当前文件夹；否则显示演示树 + 外部文件 */}
            {workspace ? (
              <div role="tree" aria-label="文件列表">
                {tagFilter && (
                  <div className="tree-filter-banner">
                    <span className="tree-filter-label">
                      #{tagFilter.tag}（{tagFilter.paths.length}）
                    </span>
                    <button
                      type="button"
                      className="tree-filter-clear"
                      onClick={() => onClearTagFilter?.()}
                      aria-label="清除标签筛选"
                      title="清除标签筛选"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {visibleWorkspaceNodes.length > 0 ? (
                  visibleWorkspaceNodes.map((node) => renderTreeNode(node, 0))
                ) : (
                  <div className="tree-empty">
                    {tagFilter ? '没有包含该标签的文件' : '文件夹为空，已新建空白文档'}
                  </div>
                )}
              </div>
            ) : (
              <div role="tree" aria-label="文件列表">
                {demoNodes.map((node) => renderTreeNode(node, 0))}
              </div>
            )}
          </div>
        )}

        {/* ===== 大纲面板 ===== */}
        {activeTab === 'outline' && (
          <div
            id="sidebar-outline-panel"
            className="panel active"
            role="tabpanel"
            aria-label="大纲"
          >
            <OutlinePanel
              content={content}
              docKey={activeFileId}
              activeOutlineIndex={activeOutlineIndex}
              onOutlineClick={onOutlineClick}
            />
          </div>
        )}

        {/* ===== 反向链接面板 ===== */}
        {activeTab === 'links' && (
          <div
            id="sidebar-links-panel"
            className="panel active"
            role="tabpanel"
            aria-label="链接"
          >
            <BacklinksPanel
              graph={workspaceIndex ? null : linkGraph}
              viewModel={sidebarViewModel}
              activeFilePath={activeLinkPath}
              loading={linksLoading}
              truncated={linksTruncated}
              onOpenLink={(path, query) => onOpenLink?.(path, query)}
              onUnresolvedClick={(target) => onUnresolvedLinkClick?.(target)}
              onOpenGraph={() => onOpenGraphView?.()}
            />
          </div>
        )}

        {/* ===== 标签面板 ===== */}
        {activeTab === 'tags' && (
          <div
            id="sidebar-tags-panel"
            className="panel active"
            role="tabpanel"
            aria-label="标签"
          >
            <TagsPanel
              files={sidebarTagFiles}
              loading={tagsLoading}
              truncated={tagsTruncated}
              activeTag={tagFilter?.tag ?? null}
              onToggleTag={(tag) => onToggleTagFilter?.(tag)}
              onOpenFile={(path) => onSelectWorkspaceFile(path, false)}
            />
          </div>
        )}
        {activeTab === 'quality' && (
          <div id="sidebar-quality-panel" className="panel active" role="tabpanel" aria-label="质量诊断">
            <QualityPanel
              diagnostics={sidebarViewModel?.diagnostics ?? diagnostics}
              indexComplete={workspaceIndex?.complete ?? false}
              indexing={indexLoading}
              onRefresh={onRefreshIndex}
              onCancel={onCancelIndex}
              onOpenDiagnostic={onOpenDiagnostic}
              typographyIssues={typographyIssues}
              onOpenTypographyIssue={onOpenTypographyIssue}
              onFixTypography={onFixTypography}
            />
          </div>
        )}
      </div>

      {/* ===== 右键上下文菜单（工作区文件操作） ===== */}
      {ctxMenu && (
        <div
          className="tree-ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {ctxMenu.node.kind === 'folder' && (
            <div
              className="tree-ctx-item"
              onClick={() => {
                if (ctxMenu.node.path) onCreateFile?.(ctxMenu.node.path)
                setCtxMenu(null)
              }}
            >
              新建文件
            </div>
          )}
          {ctxMenu.node.kind === 'file' && (
            <>
              <div
                className="tree-ctx-item"
                onClick={() => {
                  setRenamingKey(ctxMenu.node.key)
                  setRenameValue(ctxMenu.node.name)
                  setCtxMenu(null)
                }}
              >
                重命名
              </div>
              <div
                className="tree-ctx-item"
                onClick={() => {
                  if (ctxMenu.node.path) {
                    void navigator.clipboard.writeText(ctxMenu.node.path)
                  }
                  setCtxMenu(null)
                }}
              >
                复制路径
              </div>
              <div
                className="tree-ctx-item"
                onClick={() => {
                  if (ctxMenu.node.path) onOpenInNewWindow?.(ctxMenu.node.path)
                  setCtxMenu(null)
                }}
              >
                在新窗口打开
              </div>
              <div className="tree-ctx-sep" />
              <div
                className="tree-ctx-item danger"
                onClick={() => {
                  if (
                    ctxMenu.node.path &&
                    window.confirm(
                      `确定删除“${ctxMenu.node.name}”吗？\n文件将移入回收站，可恢复。`,
                    )
                  ) {
                    onDeleteFile?.(ctxMenu.node.path)
                  }
                  setCtxMenu(null)
                }}
              >
                删除
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
