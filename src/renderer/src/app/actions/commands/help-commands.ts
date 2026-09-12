import type { AppCommand } from '../../commands/app-command'
import type { ActionHandlersRef } from './types'

/**
 * 帮助与设置域命令。全部 `never` 聚焦：帮助/设置对话框接管焦点。
 */
export const createHelpCommands = (handlers: ActionHandlersRef): AppCommand[] => [
  {
    id: 'shortcuts',
    title: '快捷键列表',
    focusEditor: 'never',
    enabled: () => true,
    execute: () => handlers.current.setHelpView('shortcuts'),
  },
  {
    id: 'markdown',
    title: 'Markdown 语法参考',
    focusEditor: 'never',
    enabled: () => true,
    execute: () => handlers.current.setHelpView('syntax'),
  },
  {
    id: 'about',
    title: '关于',
    focusEditor: 'never',
    enabled: () => true,
    execute: () => handlers.current.setHelpView('about'),
  },
  {
    id: 'stats',
    title: '写作统计',
    focusEditor: 'never',
    enabled: () => true,
    execute: () => handlers.current.setHelpView('stats'),
  },
  {
    id: 'settings',
    title: '设置',
    focusEditor: 'never',
    enabled: () => true,
    execute: () => handlers.current.setSettingsOpen(true),
  },
]
