import type { AppCommand } from '../../commands/app-command'
import type { ActionHandlersRef } from './types'

const MIN_ZOOM = 0.7
const MAX_ZOOM = 1.8

/**
 * 视图域命令：侧栏/专注/预览/缩放/打字机。
 *
 * 快捷键与菜单的动作 id 存在历史差异（快捷键用 preview/focusMode，菜单用
 * togglePreview/toggleFocus）：只注册 toggle* 形态，快捷键侧别名由分发入口
 * 的 ACTION_ALIASES 归一后落到同一条命令，避免命令面板出现重复条目。
 */
export const createViewCommands = (handlers: ActionHandlersRef): AppCommand[] => [
  {
    id: 'toggleSidebar',
    title: '切换侧栏',
    enabled: () => true,
    execute: () => handlers.current.setSidebarCollapsed((v) => !v),
  },
  {
    id: 'toggleFocus',
    title: '专注模式',
    enabled: () => true,
    execute: () => handlers.current.setFocusMode((v) => !v),
  },
  {
    id: 'togglePreview',
    title: '分栏预览',
    enabled: () => true,
    execute: () => handlers.current.setPreviewMode((v) => !v),
  },
  {
      id: 'zoomIn',
      title: '放大编辑区',
      enabled: () => true,
      execute: () => handlers.current.setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(2))),
    },
    {
      id: 'zoomOut',
      title: '缩小编辑区',
      enabled: () => true,
      execute: () => handlers.current.setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(2))),
    },
    {
      id: 'zoomReset',
      title: '重置缩放',
      enabled: () => true,
      execute: () => handlers.current.setZoom(1),
    },
    {
      id: 'typewriter',
      title: '打字机模式',
      enabled: () => true,
    execute: () =>
      handlers.current.setTypewriter((v) => {
        const next = !v
        if (next) setTimeout(() => handlers.current.centerCaret(), 0)
        return next
      }),
  },
]
