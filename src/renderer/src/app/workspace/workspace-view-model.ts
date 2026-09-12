import type { SearchPreference } from '../useEditorSearch'

/**
 * 工作区视图模型：把「点选条目 → 打开文件 → 接力定位」收敛为单一往返流程。
 *
 * 此前反链跳转、工作区搜索结果、诊断跳转各自维护 seq 守卫与搜索接力逻辑，
 * 三处的并发语义并不一致（诊断跳转完全没有守卫，旧请求迟到返回会覆盖新选择）。
 * 现在统一走 `WorkspaceViewModel.reveal`：单一 seq、单一接力分支，
 * 调用方只声明「要跟什么后续动作」，不再各自复制竞态处理。
 *
 * 类型与纯函数集中在本模块（不依赖 React），便于直接单测；
 * 装配成 hook 的部分见 `useWorkspaceViewModel`。
 */

export interface RevealSearchFollowUp {
  query: string
  /** 覆盖正则开关；缺省沿用当前搜索偏好 */
  useRegex?: boolean
  /** 覆盖大小写开关；缺省沿用当前搜索偏好 */
  caseSensitive?: boolean
  /**
   * 是否打开编辑器内查找栏：
   * 反链跳转打开（用户需要看到命中并逐条跳转）；
   * 工作区搜索结果保持静默高亮（结果面板本身已在上下文里）。
   */
  openFindBar?: boolean
}

export interface RevealRequest {
  /** 目标文件路径（工作区内文件或外部 Markdown） */
  path: string
  /** 打开后接力文档内搜索定位 */
  search?: RevealSearchFollowUp
  /** 打开后把光标定位到行（1 起） */
  focusLine?: number
  /** 固定标签页（默认不固定，按预览标签打开） */
  pinned?: boolean
}

export interface WorkspaceViewModel {
  /**
   * 打开工作区文件并接力后续定位。
   *
   * 并发调用只保留最后一次：先发起的请求若迟于后发起的请求完成，
   * 不得再写入搜索状态或移动光标。
   */
  reveal(request: RevealRequest): Promise<boolean>
}

/**
 * 搜索接力的偏好补丁：未指定的开关沿用当前偏好，避免跳转动作
 * 隐式重置用户已经调好的正则/大小写/全词选项。
 */
export const buildSearchPreferencePatch = (
  current: SearchPreference,
  followUp: RevealSearchFollowUp,
): SearchPreference => ({
  ...current,
  query: followUp.query,
  useRegex: followUp.useRegex ?? current.useRegex,
  caseSensitive: followUp.caseSensitive ?? current.caseSensitive,
})
