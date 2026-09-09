/**
 * 轻量确认对话框（Promise 化）：
 * 供关闭标签/关窗等"必须由用户决策"的流程阻塞等待结果，
 * 由 App 顶层挂载的 ConfirmDialog 渲染。组件未挂载时 fail-closed（返回 'cancel'），
 * 避免等待方悬挂。
 */

export interface ConfirmButton {
  /** 稳定按钮 id；'cancel' 约定为取消/关闭语义 */
  id: string
  label: string
  /** primary = 强调（默认动作）；danger = 破坏性动作 */
  kind?: 'primary' | 'danger'
}

export interface ConfirmRequest {
  title: string
  message: string
  buttons: ConfirmButton[]
  /** 默认聚焦并响应 Enter 的按钮 id（缺省取第一个） */
  defaultId?: string
  /** 请求序号（requestConfirm 自动分配，供渲染层区分实例） */
  sequence?: number
}

type ConfirmListener = (
  request: ConfirmRequest,
  resolve: (id: string) => void,
) => void

let confirmListener: ConfirmListener | null = null
/** 请求序号：连续同标题请求（如多个同名"未命名 N.md"）靠它区分实例 */
let sequence = 0

/** 由 App 的 ConfirmDialog 挂载/卸载时注册（单实例，覆盖旧监听） */
export function setConfirmDialogListener(listener: ConfirmListener | null): void {
  confirmListener = listener
}

/** 请求用户确认；返回被点击按钮的 id（对话框未挂载时返回 'cancel'） */
export function requestConfirm(request: ConfirmRequest): Promise<string> {
  return new Promise((resolve) => {
    if (!confirmListener) {
      resolve('cancel')
      return
    }
    confirmListener({ ...request, sequence: sequence++ }, resolve)
  })
}
