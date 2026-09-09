import { useEffect, useRef } from 'react'
import { isImeComposing } from '../../lib/keyboard'
import type { ConfirmRequest } from '../../lib/confirm-dialog'

export interface ActiveConfirmRequest extends ConfirmRequest {
  /** 该请求的 Promise resolve（App 持有状态，按钮/Esc 点击后触发） */
  resolve: (id: string) => void
}

interface ConfirmDialogProps {
  request: ActiveConfirmRequest | null
  /** 用户做出选择（按钮点击 / Esc=取消） */
  onResolve: (id: string) => void
}

/**
 * 全局确认对话框（保存/放弃修改/取消 等关闭前决策）。
 * 复用于设置弹窗/帮助弹窗的 dialog 骨架，保证层级、遮罩与焦点行为一致。
 */
export function ConfirmDialog({ request, onResolve }: ConfirmDialogProps): JSX.Element | null {
  if (!request) return null
  return (
    <ConfirmDialogInner
      key={request.sequence ?? -1}
      request={request}
      onResolve={onResolve}
    />
  )
}

function ConfirmDialogInner({
  request,
  onResolve,
}: ConfirmDialogProps & { request: ActiveConfirmRequest }): JSX.Element {
  const defaultButtonRef = useRef<HTMLButtonElement>(null)
  const defaultId = request.defaultId ?? request.buttons[0]?.id ?? 'cancel'

  // 打开即聚焦默认按钮（键盘用户直接 Enter 确认，焦点不会回落到 body）
  useEffect(() => {
    defaultButtonRef.current?.focus()
  }, [])

  // Esc = 取消（捕获阶段，先于编辑器/全局快捷键处理；dialog 无输入框，不含 IME）
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isImeComposing(event)) return
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onResolve('cancel')
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onResolve])

  return (
    <div className="dialog-overlay" onClick={() => onResolve('cancel')}>
      <div
        className="dialog confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={request.title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-title">{request.title}</div>
        <div className="confirm-message">{request.message}</div>
        <div className="confirm-actions">
          {request.buttons.map((button) => (
            <button
              key={button.id}
              type="button"
              ref={button.id === defaultId ? defaultButtonRef : undefined}
              className={`dialog-btn ${button.kind === 'primary' ? 'primary' : ''} ${button.kind === 'danger' ? 'danger' : ''}`}
              onClick={() => onResolve(button.id)}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
