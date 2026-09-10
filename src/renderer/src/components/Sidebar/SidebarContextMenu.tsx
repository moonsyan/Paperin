import { useEffect, useRef } from 'react'
import type { UiNode } from './fileTree'

export interface SidebarContextMenuState {
  x: number
  y: number
  node: UiNode
  trigger: HTMLElement
}

interface SidebarContextMenuProps {
  state: SidebarContextMenuState
  onClose: (restoreFocus: boolean) => void
  onCreateFile?: (dirPath: string) => void
  onStartRename: (node: UiNode) => void
  onOpenInNewWindow?: (path: string) => void
  onDeleteFile?: (path: string) => void
}

export function SidebarContextMenu({
  state,
  onClose,
  onCreateFile,
  onStartRename,
  onOpenInNewWindow,
  onDeleteFile,
}: SidebarContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    menuRef.current?.focus()
  }, [])

  return (
    <div
      ref={menuRef}
      className="tree-ctx-menu"
      style={{ top: state.y, left: state.x }}
      role="menu"
      aria-label="文件操作"
      tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
    >
      {state.node.kind === 'folder' && (
        <button type="button" role="menuitem" className="tree-ctx-item" onClick={() => {
          if (state.node.path) onCreateFile?.(state.node.path)
          onClose(true)
        }}>
          新建文件
        </button>
      )}
      {state.node.kind === 'file' && (
        <>
          <button type="button" role="menuitem" className="tree-ctx-item" onClick={() => {
            onStartRename(state.node)
            onClose(false)
          }}>
            重命名
          </button>
          <button type="button" role="menuitem" className="tree-ctx-item" onClick={() => {
            if (state.node.path) void navigator.clipboard.writeText(state.node.path)
            onClose(true)
          }}>
            复制路径
          </button>
          <button type="button" role="menuitem" className="tree-ctx-item" onClick={() => {
            if (state.node.path) onOpenInNewWindow?.(state.node.path)
            onClose(true)
          }}>
            在新窗口打开
          </button>
          <div className="tree-ctx-sep" role="separator" />
          <button type="button" role="menuitem" className="tree-ctx-item danger" onClick={() => {
            if (state.node.path && window.confirm(`确定删除“${state.node.name}”吗？\n文件将移入回收站，可恢复。`)) {
              onDeleteFile?.(state.node.path)
            }
            onClose(true)
          }}>
            删除
          </button>
        </>
      )}
    </div>
  )
}
