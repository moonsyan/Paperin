/**
 * OverlayState：主弹窗联合状态。
 *
 * 用一个互斥的 union 取代不断增长的 boolean 组合（settings/search/history/
 * export/confirm），任意时刻最多只有一个主弹窗打开。关闭由消费方直接置
 * null；打开统一走 openOverlay 整体替换。
 */

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

export type OverlayState =
  | { type: 'settings' }
  | { type: 'search'; replace: boolean }
  | { type: 'history'; fileId: string }
  | { type: 'export'; format: string }
  | { type: 'confirm'; request: ConfirmRequest }
  | null

/** 打开新弹窗：直接整体替换当前弹窗，保证互斥 */
export const openOverlay = (
  current: OverlayState,
  next: Exclude<OverlayState, null>,
): OverlayState => {
  void current
  return next
}
