import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import { comboFromEvent } from '../data/shortcuts'
import { isEditableShortcutTarget, isImeComposing } from '../lib/keyboard'

export interface UseGlobalShortcutsOptions {
  /** 组合键 → 动作反查表（keydown 中读 ref，避免频繁重建监听） */
  shortcutLookupRef: MutableRefObject<Record<string, string>>
  /** 弹窗打开标志镜像（M4）：对话框打开期间禁用全局快捷键 */
  modalOpenRef: MutableRefObject<boolean>
  /** 代码块全屏镜像：全屏时查找/替换键位不抢焦点 */
  fullscreenOpenRef: MutableRefObject<boolean>
  /** 统一动作分发（useAppActions.handleAction）：快捷键与菜单/命令面板共享同一 execute */
  dispatchAction: (action: string) => void
}

/** 全局快捷键（可自定义，查表分发）。
 *
 *  分发收敛：键位解析与守卫（弹窗/IME/重复/可编辑目标）留在本 hook，
 *  动作执行全部委托 dispatchAction —— 编辑器命令由分发层走共享命令表，
 *  应用层动作走命令注册表，与菜单、右键菜单、命令面板同源。 */
export function useGlobalShortcuts({
  shortcutLookupRef,
  modalOpenRef,
  fullscreenOpenRef,
  dispatchAction,
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
      // 代码块全屏层（z-900）盖住查找栏（z-100）：全屏时打开会把
      // 焦点抢进不可见的输入框、击键"消失"——退出全屏前忽略
      if ((action === 'find' || action === 'replace') && fullscreenOpenRef.current) return
      dispatchAction(action)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dispatchAction, modalOpenRef, fullscreenOpenRef, shortcutLookupRef])
}
