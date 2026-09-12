import type { AppCommand } from '../../commands/app-command'
import type { ActionHandlersRef } from './types'

/**
 * 搜索域命令：文档内查找/替换、工作区全文搜索、命令面板。
 * 全部 `never` 聚焦：搜索栏/对话框接管焦点，编辑器聚焦会抢走输入焦点。
 */
export const createSearchCommands = (handlers: ActionHandlersRef): AppCommand[] => [
  {
    id: 'find',
    title: '查找',
    focusEditor: 'never',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.setSearchMode('find'),
  },
  {
    id: 'replace',
    title: '查找替换',
    focusEditor: 'never',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.setSearchMode('replace'),
  },
  {
    id: 'wsSearch',
    title: '工作区全文搜索',
    focusEditor: 'never',
    enabled: () => true,
    execute: () => {
      // 用 ref 镜像而非 workspace 状态：命令只注册一次，直接捕获状态会因
      // 陈旧闭包导致打开文件夹后仍提示未打开
      if (handlers.current.workspacePathRef.current) handlers.current.setWsSearchOpen(true)
      else handlers.current.setToast('请先打开文件夹（工作区）后再使用全文搜索')
    },
  },
  {
    id: 'commandPalette',
    title: '命令面板',
    focusEditor: 'never',
    enabled: () => true,
    execute: () => handlers.current.setPaletteOpen(true),
  },
]
