import { useState, useEffect, useRef, useCallback } from 'react'
import type { Dispatch, SetStateAction, RefObject } from 'react'
import { isImeComposing } from '../lib/keyboard'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAppLayoutOptions {
  /** 弹窗打开标志（专注模式 Esc 需跳过弹窗打开期间） */
  modalOpenRef: RefObject<boolean>
  /** 代码块全屏标志（全屏 Esc 由编辑器内部处理，专注模式需跳过） */
  fullscreenOpenRef: RefObject<boolean>
  focusMode: boolean
  setFocusMode: Dispatch<SetStateAction<boolean>>
  searchMode: 'find' | 'replace' | 'none'
}

export interface UseAppLayoutResult {
  sidebarWidth: number
  setSidebarWidth: Dispatch<SetStateAction<number>>
  sidebarWidthRef: RefObject<number>
  startSidebarResize: (e: React.MouseEvent) => void
  zoom: number
  setZoom: Dispatch<SetStateAction<number>>
  zoomRef: RefObject<number>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 应用布局控制：侧栏宽度拖拽、编辑区缩放、专注模式 Esc 退出。
 *
 * 职责边界：
 * - 侧栏宽度状态 + 鼠标拖拽调整（含 zoom 补偿）
 * - 编辑区缩放状态 + Ctrl/Cmd+滚轮缩放（阻止 Chromium 页面级缩放）
 * - 缩放值写入 CSS 变量 --editor-zoom
 * - 专注模式下 window Esc 监听（跳过弹窗/全屏/搜索/IME 组合态）
 *
 * 不包含：侧栏折叠状态（由 useEditorViewState 管理）、布局预设（由 command registry 管理）
 */
export function useAppLayout({
  modalOpenRef,
  fullscreenOpenRef,
  focusMode,
  setFocusMode,
  searchMode,
}: UseAppLayoutOptions): UseAppLayoutResult {
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const sidebarWidthRef = useRef(260)
  sidebarWidthRef.current = sidebarWidth

  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(1)
  zoomRef.current = zoom

  // --- 编辑区缩放 CSS 变量同步 ---
  useEffect(() => {
    document.documentElement.style.setProperty('--editor-zoom', String(zoom))
  }, [zoom])

  // --- Ctrl/Cmd + 滚轮缩放编辑区 ---
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (!(e.target instanceof Element) || !e.target.closest('.editor-content')) return
      const step = e.deltaY < 0 ? 0.1 : -0.1
      setZoom((z) => Math.min(1.8, Math.max(0.7, +(z + step).toFixed(2))))
    }
    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [])

  // --- 侧栏宽度拖拽调整 ---
  const startSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidthRef.current
    const move = (ev: MouseEvent) => {
      const delta = (ev.clientX - startX) / zoomRef.current
      setSidebarWidth(Math.min(480, Math.max(180, startW + delta)))
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [])

  // --- 专注模式 Esc 退出 ---
  useEffect(() => {
    if (!focusMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (isImeComposing(event)) return
      if (event.key !== 'Escape') return
      if (modalOpenRef.current || searchMode !== 'none') return
      if (fullscreenOpenRef.current) return
      setFocusMode(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusMode, searchMode, modalOpenRef, fullscreenOpenRef, setFocusMode])

  return {
    sidebarWidth,
    setSidebarWidth,
    sidebarWidthRef,
    startSidebarResize,
    zoom,
    setZoom,
    zoomRef,
  }
}
