/**
 * AppCommand：菜单、快捷键和命令面板共享的统一命令模型。
 *
 * 三类入口不再各自维护 enabled 判断和执行逻辑，而是共享同一条
 * `AppCommand` 实现；`CommandContext` 携带入口判断所需的会话状态快照。
 */

export interface CommandContext {
  activeFileId: string
  hasWorkspace: boolean
  hasUnsavedChanges: boolean
}

export interface AppCommand {
  id: string
  title: string
  shortcut?: string
  enabled: (context: CommandContext) => boolean
  execute: (context: CommandContext) => Promise<void> | void
}
