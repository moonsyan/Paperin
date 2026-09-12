import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isImeComposing } from '../lib/keyboard'
import type { ContextDockVisibility } from '../components/ContextDock/context-dock-state'
import {
  onNarrowEnter,
  onNarrowExit,
  openDrawerOverlay,
  resolveDrawerVisibility,
  type DrawerOverlay,
} from './workspace/drawer-coordinator'

/**
 * 窄窗口抽屉协调 hook（T11）。
 *
 * - 持久化偏好（sidebarCollapsed / dock visibility）由调用方持有，
 *   本 hook 只管理瞬时 overlay：最近打开者获胜、Escape / 遮罩关闭、
 *   窗口跨断点时失效。不改持久化状态（「收起侧栏」显式动作除外，
 *   该动作本就属于用户偏好变更）。
 * - 关闭抽屉后焦点恢复到打开它的触发控件；触发控件已被删除时
 *   焦点落回 body（浏览器默认），不强移到编辑器打断用户。
 */

/** 与 global.css 窄窗口断点保持一致 */
const NARROW_DRAWER_QUERY = '(max-width: 820px)'

export interface UseWorkspaceDrawersOptions {
  /** 持久化偏好：侧栏收起（true = 收起） */
  sidebarCollapsed: boolean
  /** 持久化偏好：ContextDock 可见性 */
  dockVisibility: ContextDockVisibility
  /** 侧栏偏好变更（用户显式收起/展开；持久化写入由调用方处理） */
  onSidebarCollapsedChange: (collapsed: boolean) => void
}

export interface UseWorkspaceDrawersResult {
  isNarrow: boolean
  drawerOverlay: DrawerOverlay
  /** 有效可见性：窄窗口按 overlay，宽窗口按持久化偏好 */
  sidebarVisible: boolean
  dockVisible: boolean
  /** 侧栏切换按钮（顶栏左区 + 工作区边缘按钮共用） */
  toggleSidebar: (trigger?: HTMLElement) => void
  /** dock 面板被展开时调用（窄窗口下让侧栏退出） */
  notifyDockOpened: (trigger?: HTMLElement) => void
  /** Escape / 遮罩点击：关闭当前抽屉并恢复触发焦点 */
  closeActiveDrawer: () => void
  /** 遮罩元素属性（渲染在 AppWorkspace） */
  scrimProps: {
    className: string
    onClick: () => void
    'aria-hidden': true
  } | null
}

const readNarrow = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(NARROW_DRAWER_QUERY).matches

export function useWorkspaceDrawers(options: UseWorkspaceDrawersOptions): UseWorkspaceDrawersResult {
  const { sidebarCollapsed, dockVisibility, onSidebarCollapsedChange } = options

  const [isNarrow, setIsNarrow] = useState<boolean>(readNarrow)
  // 首次渲染就在窄窗口时，按当前偏好初始化 overlay（两侧都开保留侧栏）
  const [drawerOverlay, setDrawerOverlay] = useState<DrawerOverlay>(() =>
    readNarrow() ? onNarrowEnter(!sidebarCollapsed, dockVisibility === 'expanded') : null,
  )
  const triggerRef = useRef<HTMLElement | null>(null)

  // 跨断点：进入窄窗口时初始化 overlay（两侧都开则保留侧栏）；离开时失效
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(NARROW_DRAWER_QUERY)
    const handleChange = (event: MediaQueryListEvent) => {
      const narrow = event.matches
      setIsNarrow(narrow)
      setDrawerOverlay((prev) => {
        if (!narrow) return onNarrowExit()
        if (prev !== null) return prev
        return onNarrowEnter(!sidebarCollapsed, dockVisibility === 'expanded')
      })
    }
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  }, [sidebarCollapsed, dockVisibility])

  const focusTrigger = useCallback(() => {
    const trigger = triggerRef.current
    triggerRef.current = null
    if (trigger?.isConnected) trigger.focus()
  }, [])

  // 有效可见性：窄窗口按 overlay，宽窗口按持久化偏好
  const visibility = useMemo(
    () => resolveDrawerVisibility(
      isNarrow,
      drawerOverlay,
      !sidebarCollapsed,
      dockVisibility === 'expanded',
    ),
    [isNarrow, drawerOverlay, sidebarCollapsed, dockVisibility],
  )

  const closeActiveDrawer = useCallback(() => {
    if (drawerOverlay === null) return
    setDrawerOverlay(null)
    focusTrigger()
  }, [drawerOverlay, focusTrigger])

  // Escape 关闭当前模态抽屉（组合态中 Enter/Escape 属于输入法，不拦截）
  useEffect(() => {
    if (!isNarrow || drawerOverlay === null) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isImeComposing(event)) return
      event.preventDefault()
      event.stopPropagation()
      setDrawerOverlay(null)
      focusTrigger()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isNarrow, drawerOverlay, focusTrigger])

  const toggleSidebar = useCallback((trigger?: HTMLElement) => {
    // 语义基于「有效可见性」而非持久化偏好：窄窗口下偏好开但被 dock
    // overlay 挡下时，点击按钮的意图是打开侧栏抽屉
    if (visibility.sidebar) {
      // 显式收起 = 用户偏好变更（持久化），同时清瞬时 overlay
      onSidebarCollapsedChange(true)
      setDrawerOverlay(null)
      return
    }
    triggerRef.current = trigger ?? null
    onSidebarCollapsedChange(false)
    setDrawerOverlay(openDrawerOverlay(drawerOverlay, 'sidebar'))
  }, [visibility.sidebar, drawerOverlay, onSidebarCollapsedChange])

  const notifyDockOpened = useCallback((trigger?: HTMLElement) => {
    triggerRef.current = trigger ?? null
    setDrawerOverlay((prev) => openDrawerOverlay(prev, 'dock'))
  }, [])

  // 遮罩只在窄窗口有抽屉打开时渲染（z 序见 global.css：sidebar 60 / dock 56 / scrim 50）
  const scrimProps = isNarrow && drawerOverlay !== null
    ? {
        className: 'workspace-scrim',
        onClick: closeActiveDrawer,
        'aria-hidden': true as const,
      }
    : null

  return {
    isNarrow,
    drawerOverlay,
    sidebarVisible: visibility.sidebar,
    dockVisible: visibility.dock,
    toggleSidebar,
    notifyDockOpened,
    closeActiveDrawer,
    scrimProps,
  }
}
