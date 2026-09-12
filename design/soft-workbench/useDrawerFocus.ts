import { useEffect } from 'react'

/** 原型窄窗抽屉的键盘约束；生产迁移复用 useWorkspaceDrawers。 */
export function useDrawerFocus(sidebarVisible: boolean, panelVisible: boolean): void {
  useEffect(() => {
    if (window.innerWidth > 820 || (!sidebarVisible && !panelVisible)) return
    const drawer = document.querySelector<HTMLElement>(panelVisible ? '.inspector' : '.navigation')
    const main = document.querySelector<HTMLElement>('.main-shell')
    if (!drawer || !main) return
    const trigger = document.activeElement
    main.setAttribute('inert', '')
    const controls = (): HTMLElement[] => Array.from(drawer.querySelectorAll<HTMLElement>('button,a[href]'))
    controls()[0]?.focus()
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || event.isComposing) return
      const items = controls(), first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    drawer.addEventListener('keydown', handleKeyDown)
    return () => {
      main.removeAttribute('inert')
      drawer.removeEventListener('keydown', handleKeyDown)
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  }, [sidebarVisible, panelVisible])
}
