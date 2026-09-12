import type { AppCommand } from '../../commands/app-command'
import { createFileCommands } from './file-commands'
import { createHelpCommands } from './help-commands'
import { createPanelCommands } from './panel-commands'
import { createSearchCommands } from './search-commands'
import { createViewCommands } from './view-commands'
import type { ActionHandlersRef } from './types'

/**
 * 应用层动作命令全集：菜单、右键菜单、快捷键和命令面板共享同一 execute。
 *
 * 历史动作 id 差异（快捷键 preview/focusMode vs 菜单 togglePreview/toggleFocus）
 * 由 ACTION_ALIASES 在分发入口归一；注册表只保留 toggle* 形态。
 */
export const ACTION_ALIASES: Record<string, string> = {
  preview: 'togglePreview',
  focusMode: 'toggleFocus',
}

export const createAppActionCommands = (handlers: ActionHandlersRef): AppCommand[] => [
  ...createFileCommands(handlers),
  ...createSearchCommands(handlers),
  ...createViewCommands(handlers),
  ...createPanelCommands(handlers),
  ...createHelpCommands(handlers),
]

export type { ActionHandlers, ActionHandlersRef } from './types'
