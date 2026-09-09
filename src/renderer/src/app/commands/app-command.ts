/**
 * AppCommand：菜单、快捷键和命令面板共享的统一命令模型。
 *
 * 三类入口不再各自维护 enabled 判断和执行逻辑，而是共享同一条
 * `AppCommand` 实现；`CommandContext` 携带入口判断所需的会话状态快照。
 */

export type { CommandContext } from './command-context'
import type { CommandContext } from './command-context'
import type { CommandScope } from './command-context'

export interface AppCommand {
  id: string
  title: string
  shortcut?: string
  keywords?: readonly string[]
  scope?: CommandScope
  enabled: (context: CommandContext) => boolean
  execute: (context: CommandContext) => Promise<void> | void
}
