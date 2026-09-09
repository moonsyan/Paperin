import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { comboFromEvent } from '../data/shortcuts'
import { isEditableShortcutTarget, isImeComposing } from '../lib/keyboard'
import { resolveEditorAction } from './editorActions'
import type { EditorHandle } from '../components/Editor'

export interface UseGlobalShortcutsOptions {
  /** 组合键 → 动作反查表（keydown 中读 ref，避免频繁重建监听） */
  shortcutLookupRef: MutableRefObject<Record<string, string>>
  /** 弹窗打开标志镜像（M4）：对话框打开期间禁用全局快捷键 */
  modalOpenRef: MutableRefObject<boolean>
  /** 代码块全屏镜像：全屏时查找/替换键位不抢焦点 */
  fullscreenOpenRef: MutableRefObject<boolean>
  editorRef: MutableRefObject<EditorHandle | null>
  /** 当前标签 id 镜像：handler 不随 activeFileId 重建 */
  activeFileIdRef: MutableRefObject<string>
  handleNew: () => void
  handleOpen: () => void | Promise<void>
  handleOpenFolder: () => void | Promise<void>
  handleSave: () => void | Promise<void>
  handleSaveAs: () => void | Promise<void>
  handleCloseTab: (fileId: string) => void
  openOutlinePanel: () => void
  setPaletteOpen: Dispatch<SetStateAction<boolean>>
  setSearchMode: Dispatch<SetStateAction<'none' | 'find' | 'replace'>>
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>
  setPreviewMode: Dispatch<SetStateAction<boolean>>
  setZoom: Dispatch<SetStateAction<number>>
  setFocusMode: Dispatch<SetStateAction<boolean>>
}

/** 全局快捷键（可自定义，查表分发）。
 *  从 App.tsx 原样迁移：守卫顺序、键位语义与依赖数组保持不变。 */
export function useGlobalShortcuts({
  shortcutLookupRef,
  modalOpenRef,
  fullscreenOpenRef,
  editorRef,
  activeFileIdRef,
  handleNew,
  handleOpen,
  handleOpenFolder,
  handleSave,
  handleSaveAs,
  handleCloseTab,
  openOutlinePanel,
  setPaletteOpen,
  setSearchMode,
  setSidebarCollapsed,
  setPreviewMode,
  setZoom,
  setFocusMode,
}: UseGlobalShortcutsOptions): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // M4：弹窗/对话框打开时全局快捷键一律不响应（焦点可能在按钮上，
      // isEditableShortcutTarget 拦不住），由弹窗自身的键位处理接管
      if (modalOpenRef.current) return
      if (isImeComposing(e)) return
      // M6：事件已被更优先的处理者消费（defaultPrevented）或长按自动重复时不再触发动作
      if (e.defaultPrevented) return
      if (e.repeat) return
      const combo = comboFromEvent(e)
      if (!combo) return
      const action = shortcutLookupRef.current[combo]
      if (!action) return
      if (isEditableShortcutTarget(e.target)) return
      e.preventDefault()
      // 编辑器命令类动作（strike/link/image/codeBlock/quote/hr/h1-h3/text）
      // 统一走共享命令表，与菜单分发同源
      const editorAction = resolveEditorAction(action)
      if (editorAction) {
        editorAction(editorRef.current)
        return
      }
      switch (action) {
        case 'new': handleNew(); break
        case 'open': void handleOpen(); break
        case 'openFolder': void handleOpenFolder(); break
        case 'commandPalette': setPaletteOpen(true); break
        case 'save': void handleSave(); break
        case 'saveAs': void handleSaveAs(); break
        // 用 ref 实时读当前标签：handler 不随 activeFileId 重建（依赖数组固定）
        case 'closeTab': handleCloseTab(activeFileIdRef.current); break
        case 'find':
        case 'replace': {
          // 代码块全屏层（z-900）盖住查找栏（z-100）：全屏时打开会把
          // 焦点抢进不可见的输入框、击键"消失"——退出全屏前忽略
          if (!fullscreenOpenRef.current) {
            setSearchMode(action === 'find' ? 'find' : 'replace')
          }
          break
        }
        case 'toggleSidebar': setSidebarCollapsed((v) => !v); break
        case 'outline': openOutlinePanel(); break
        case 'preview': setPreviewMode((v) => !v); break
        case 'zoomIn': setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2))); break
        case 'zoomOut': setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2))); break
        case 'focusMode': setFocusMode((v) => !v); break
        default: break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, handleSaveAs, handleNew, handleOpen, handleOpenFolder, openOutlinePanel, handleCloseTab, modalOpenRef, fullscreenOpenRef, shortcutLookupRef, editorRef, activeFileIdRef, setPaletteOpen, setSearchMode, setSidebarCollapsed, setPreviewMode, setZoom, setFocusMode])
}
