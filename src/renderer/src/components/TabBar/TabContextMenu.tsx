import { useEffect, useRef } from 'react'

export interface TabContextMenuState {
  x: number
  y: number
  fileId: string
  trigger: HTMLElement
}

interface TabContextMenuProps {
  state: TabContextMenuState
  pinned: boolean
  canCloseOthers: boolean
  canCloseAll: boolean
  onDismiss: (restoreFocus: boolean) => void
  onTogglePin: (id: string) => void
  onCloseTab: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseAll: () => void
}

export function TabContextMenu({
  state,
  pinned,
  canCloseOthers,
  canCloseAll,
  onDismiss,
  onTogglePin,
  onCloseTab,
  onCloseOthers,
  onCloseAll,
}: TabContextMenuProps): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    menuRef.current?.focus()
    const handlePointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.tab-ctx-menu')) onDismiss(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss(true)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onDismiss])

  return (
    <div ref={menuRef} className="tab-ctx-menu" style={{ top: state.y, left: state.x }} role="menu" aria-label="标签页操作" tabIndex={-1}>
      <button type="button" className="tab-ctx-item" role="menuitem" onClick={() => {
        onTogglePin(state.fileId)
        onDismiss(true)
      }}>
        {pinned ? '取消固定标签页' : '固定标签页'}
      </button>
      <div className="tab-ctx-sep" role="separator" />
      <button type="button" className="tab-ctx-item" role="menuitem" onClick={() => {
        onCloseTab(state.fileId)
        onDismiss(false)
      }}>
        关闭
      </button>
      <button type="button" className="tab-ctx-item" role="menuitem" disabled={!canCloseOthers} onClick={() => {
        onCloseOthers(state.fileId)
        onDismiss(false)
      }}>
        关闭其他标签页
      </button>
      <div className="tab-ctx-sep" role="separator" />
      <button type="button" className="tab-ctx-item" role="menuitem" disabled={!canCloseAll} onClick={() => {
        onCloseAll()
        onDismiss(false)
      }}>
        关闭全部标签页
      </button>
    </div>
  )
}
