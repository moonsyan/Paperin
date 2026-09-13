import { useCallback, useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { clampMenuPosition } from '../../lib/menu-position'
import { isImeComposing } from '../../lib/keyboard'
import type { SidebarContextMenuState } from './SidebarContextMenu'
import type { UiNode } from './fileTree'

/** 文件上下文菜单、焦点恢复与内联重命名共享一个生命周期。 */
export function useSidebarFileActions(hasWorkspace: boolean) {
  const [ctxMenu, setCtxMenu] = useState<SidebarContextMenuState | null>(null)
  const [renamingKey, setRenamingKey] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
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
      if (event.key === 'Escape' && !isImeComposing(event)) {
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


  const openCtxMenu = (event: ReactMouseEvent, node: UiNode) => {
    if (!hasWorkspace || !node.path) return
    event.preventDefault()
    const pos = clampMenuPosition(event.clientX, event.clientY)
    setCtxMenu({ ...pos, node, trigger: event.currentTarget as HTMLElement })
  }

  return { ctxMenu, closeCtxMenu, openCtxMenu, renamingKey, renameValue, setRenameValue, setRenamingKey }
}
