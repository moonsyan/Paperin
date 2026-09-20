import { useEffect, useRef, type RefObject } from 'react'
import { SKIP_LINK_TARGET_ID } from '../app/SkipLink'
import { isImeComposing } from '../lib/keyboard'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function getDialogFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (node) => !node.hasAttribute('disabled') && node.tabIndex !== -1,
  )
}

/** 触发按钮已卸载时，把焦点落到正文宿主或工作区 region。 */
export function focusSafeWorkspaceEntry(): void {
  const editorHost = document.getElementById(SKIP_LINK_TARGET_ID)
  if (editorHost instanceof HTMLElement) {
    editorHost.focus()
    return
  }
  const workspace = document.querySelector<HTMLElement>('[role="region"][aria-label="工作区"]')
  workspace?.focus()
}

function isFocusRestoreCandidate(element: HTMLElement | null | undefined): element is HTMLElement {
  if (!element?.isConnected) return false
  return element !== document.body && element !== document.documentElement
}

export function restoreDialogFocus(
  previouslyFocused: HTMLElement | null,
  triggerRef?: RefObject<HTMLElement | null>,
): void {
  const trigger = triggerRef?.current ?? null
  if (isFocusRestoreCandidate(trigger)) {
    trigger.focus()
    return
  }
  if (isFocusRestoreCandidate(previouslyFocused)) {
    previouslyFocused.focus()
    return
  }
  focusSafeWorkspaceEntry()
}

interface UseModalDialogKeyboardOptions {
  open: boolean
  onClose: () => void
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef?: RefObject<HTMLElement | null>
  triggerRef?: RefObject<HTMLElement | null>
  /** 为 false 时 Escape 不关闭（例如导出进行中）。 */
  closeOnEscape?: boolean
}

/**
 * 模态弹窗键盘契约：初始焦点、Tab 循环、Escape（尊重 IME）、关闭后焦点恢复。
 * 与 CommandPalette / HelpDialog 行为对齐，使用捕获阶段监听以免落到背景快捷键。
 */
export function useModalDialogKeyboard({
  open,
  onClose,
  dialogRef,
  initialFocusRef,
  triggerRef,
  closeOnEscape = true,
}: UseModalDialogKeyboardOptions): void {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusInitial = (): void => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
        return
      }
      const dialog = dialogRef.current
      if (!dialog) return
      const [first] = getDialogFocusableElements(dialog)
      first?.focus()
    }
    focusInitial()

    const handler = (event: KeyboardEvent) => {
      if (isImeComposing(event)) return
      if (event.key === 'Escape') {
        if (!closeOnEscape) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const nodes = getDialogFocusableElements(dialog)
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      restoreDialogFocus(previouslyFocusedRef.current, triggerRef)
    }
  }, [open, onClose, closeOnEscape, dialogRef, initialFocusRef, triggerRef])
}
