/**
 * AppCommand：菜单、快捷键和命令面板共享的统一命令模型。
 *
 * 三类入口不再各自维护 enabled 判断和执行逻辑，而是共享同一条
 * `AppCommand` 实现；`CommandContext` 携带入口判断所需的会话状态快照。
 */

export type { CommandContext } from './command-context'
import type { CommandContext } from './command-context'
import type { CommandScope } from './command-context'

/**
 * 命令执行后的编辑器焦点策略：
 * - `always`：execute 派发后立即聚焦编辑器（普通动作的历史行为）；
 * - `settle`：等待 execute 完成后聚焦（原生打开/保存/导出对话框：同步聚焦会被
 *   对话框打断，取消后焦点落在窗口 chrome 上）；
 * - `never`：不聚焦（命令自身打开对话框/面板，焦点由它们接管）。
 */
export type CommandFocusPolicy = 'always' | 'settle' | 'never'

export interface AppCommand {
  id: string
  title: string
  shortcut?: string
  keywords?: readonly string[]
  scope?: CommandScope
  /** 缺省为 `always`，与历史菜单/快捷键行为一致 */
  focusEditor?: CommandFocusPolicy
  /**
   * 当前上下文不可用时的提示文案。
   *
   * 菜单/命令面板能依赖灰显表达「不可用」，但快捷键与右键菜单没有灰显可依赖——
   * 没有这条提示，用户按快捷键只会得到一次静默无响应。
   */
  unavailableHint?: string
  enabled: (context: CommandContext) => boolean
  execute: (context: CommandContext) => Promise<void> | void
}
