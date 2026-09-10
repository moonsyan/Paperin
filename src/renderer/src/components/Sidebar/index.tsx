import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { isImeComposing } from '../../lib/keyboard'
import {
  buildDemoFileTree,
  buildWorkspaceFileTree,
  collectFolderKeys,
  collectFolderKeysUnder,
  findNodeByKey,
  type UiNode,
} from './fileTree'
import { filterTreeByPaths } from './fileTree'
import { clampMenuPosition } from '../../lib/menu-position'
import type { SidebarProps } from './types'
import { collectExternalOpenFiles } from './sidebar-file-model'
import { SidebarContextMenu, type SidebarContextMenuState } from './SidebarContextMenu'
import { ChevronIcon, FileIcon, FolderIcon } from './SidebarIcons'

export type { OpenFile, SidebarProps, WorkspaceInfo } from './types'

/* Sidebar intentionally owns only the file tree. Secondary panels are registered
 * in ContextDock so their lifecycle and keyboard focus remain independent. */

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
}: SidebarProps): JSX.Element {
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(
    () => new Set(initialCollapsedKeys ?? []),
  )
  // 右键菜单与内联重命名
  const [ctxMenu, setCtxMenu] = useState<SidebarContextMenuState | null>(null)
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

  const externalNodes = useMemo<UiNode[]>(
    () => collectExternalOpenFiles(openFiles, workspace?.path ?? null).map((file) => ({
      key: `external:${file.id}`,
      name: file.name,
      kind: 'file',
      path: file.path,
    })),
    [openFiles, workspace?.path],
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
      <div className="sidebar-body">
        <div className="panel active" role="tabpanel" aria-label="文件">
          {tagFilter && (
            <div className="tree-filter-banner">
              <span className="tree-filter-label">#{tagFilter.tag}（{tagFilter.paths.length}）</span>
              <button type="button" className="tree-filter-clear" onClick={() => onClearTagFilter?.()} aria-label="清除标签筛选" title="清除标签筛选">✕</button>
            </div>
          )}
          <div role="tree" aria-label="文件列表">
            {workspace ? (
              visibleWorkspaceNodes.length > 0
                ? visibleWorkspaceNodes.map((node) => renderTreeNode(node, 0))
                : <div className="tree-empty">{tagFilter ? '没有包含该标签的文件' : '文件夹为空，已新建空白文档'}</div>
            ) : demoNodes.map((node) => renderTreeNode(node, 0))}
            {externalNodes.length > 0 && (
              <div className="tree-external-group" role="group" aria-label="外部文件">
                <div className="tree-section-label">外部文件</div>
                {externalNodes.map((node) => renderTreeNode(node, 0))}
              </div>
            )}
          </div>
        </div>
      </div>

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
        />
      )}
    </div>
  )
}
