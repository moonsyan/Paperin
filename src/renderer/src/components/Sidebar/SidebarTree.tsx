import { useState } from 'react'
import { isImeComposing } from '../../lib/keyboard'
import { ChevronIcon, FileIcon, FolderIcon } from './SidebarIcons'
import type { UiNode } from './fileTree'

/**
 * Sidebar 的树渲染与行级交互：层级引导线、展开/折叠、选中、
 * 内联重命名输入、以及工作区文件的拖拽移动（U5）。
 *
 * 只做渲染与交互，不持有树数据与折叠记录——折叠状态由
 * useSidebarCollapse 提供，节点数据由 Sidebar 建模后传入。
 */

export interface SidebarTreeProps {
  nodes: UiNode[]
  /** 支持拖拽移动与右键菜单：仅工作区树为 true（演示树不可编辑） */
  interactive: boolean
  activeFileId: string
  collapsedKeys: Set<string>
  onToggleCollapse: (key: string) => void
  onOpenFile: (node: UiNode, pinned: boolean) => void
  onContextMenu: (event: React.MouseEvent, node: UiNode) => void
  onMoveFile?: (srcPath: string, targetDir: string) => void
  /** 正在内联重命名的节点 key */
  renamingKey: string | null
  renameValue: string
  onRenameValueChange: (value: string) => void
  onRenameCommit: (node: UiNode, value: string) => void
  onRenameCancel: () => void
}

export function SidebarTree({
  nodes,
  interactive,
  activeFileId,
  collapsedKeys,
  onToggleCollapse,
  onOpenFile,
  onContextMenu,
  onMoveFile,
  renamingKey,
  renameValue,
  onRenameValueChange,
  onRenameCommit,
  onRenameCancel,
}: SidebarTreeProps): JSX.Element {
  // 拖拽移动：正在拖动的节点与当前悬停的投放目标
  const [dragNode, setDragNode] = useState<{ path: string; kind: 'file' | 'folder' } | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)

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

  const startDrag = (event: React.DragEvent, node: UiNode): void => {
    if (!node.path) return
    setDragNode({ path: node.path, kind: node.kind })
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', node.name)
  }

  const endDrag = (): void => {
    setDragNode(null)
    setDropKey(null)
  }

  const renderTreeNode = (node: UiNode, depth: number): JSX.Element => {
    const indent = 8 + depth * 14
    // 层级引导线：每个祖先层级一条竖线（与箭头列对齐）
    const guides: JSX.Element[] = []
    for (let i = 0; i < depth; i++) {
      guides.push(<span key={i} className="tree-guide" style={{ left: 8 + i * 14 + 5 }} />)
    }
    if (node.kind === 'folder') {
      const open = !collapsedKeys.has(node.key)
      // 工作区文件夹支持拖入移动（U5）
      const droppable = interactive && !!node.path
      return (
        <div key={node.key} role="none">
          <div
            className={`tree-row tree-folder-row ${dropKey === node.key ? 'drop-target' : ''}`}
            style={{ paddingLeft: indent }}
            role="treeitem"
            tabIndex={0}
            aria-expanded={open}
            onClick={() => onToggleCollapse(node.key)}
            onKeyDown={(event) => {
              if (isImeComposing(event.nativeEvent)) return
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              onToggleCollapse(node.key)
            }}
            onContextMenu={(e) => onContextMenu(e, node)}
            draggable={droppable}
            onDragStart={(e) => startDrag(e, node)}
            onDragEnd={endDrag}
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
              endDrag()
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
        <div key={node.key} className="tree-row tree-file-row" style={{ paddingLeft: indent }}>
          {guides}
          <span className="tree-chevron-slot" />
          <FileIcon />
          <input
            className="tree-rename-input"
            autoFocus
            value={renameValue}
            spellCheck={false}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (isImeComposing(e.nativeEvent)) return
              if (e.key === 'Enter') {
                e.preventDefault()
                onRenameCommit(node, renameValue)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                onRenameCancel()
              }
            }}
            onBlur={onRenameCancel}
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
        onClick={() => onOpenFile(node, false)}
        onDoubleClick={() => onOpenFile(node, true)}
        onKeyDown={(event) => {
          if (isImeComposing(event.nativeEvent)) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onOpenFile(node, false)
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
        draggable={interactive && !!node.path}
        onDragStart={(e) => startDrag(e, node)}
        onDragEnd={endDrag}
      >
        {guides}
        <span className="tree-chevron-slot" />
        <FileIcon />
        <span className="tree-name">{node.name}</span>
      </div>
    )
  }

  return <>{nodes.map((node) => renderTreeNode(node, 0))}</>
}
