import type { AppCommand } from '../../commands/app-command'
import type { ActionHandlersRef } from './types'

/**
 * 面板域命令：大纲/关系/标签/属性/质量检查/图谱/版本历史。
 * versionHistory 用 `never` 聚焦：版本历史对话框接管焦点；
 * 其余面板命令保持历史行为（打开面板后焦点回到编辑器）。
 */
export const createPanelCommands = (handlers: ActionHandlersRef): AppCommand[] => [
  {
    id: 'outline',
    title: '大纲面板',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.openOutlinePanel(),
  },
  {
    id: 'linksPanel',
    title: '关系面板',
    scope: 'workspace',
    enabled: () => true,
    execute: () => handlers.current.openContextPanel('links'),
  },
  {
    id: 'tagsPanel',
    title: '标签面板',
    scope: 'workspace',
    enabled: () => true,
    execute: () => handlers.current.openContextPanel('tags'),
  },
  {
    id: 'propertiesPanel',
    title: '属性面板',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.openContextPanel('properties'),
  },
  {
    id: 'qualityPanel',
    title: '质量检查面板',
    scope: 'workspace',
    enabled: () => true,
    execute: () => handlers.current.openContextPanel('quality'),
  },
  {
    id: 'graph',
    title: '关系图谱',
    enabled: () => true,
    execute: () => handlers.current.openGraphView(),
  },
  {
    id: 'versionHistory',
    title: '版本历史',
    focusEditor: 'never',
    enabled: () => true,
    execute: () => handlers.current.handleOpenVersionHistory(),
  },
]
