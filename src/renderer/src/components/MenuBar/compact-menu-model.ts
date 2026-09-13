import { buildMenus, MENU_DEFS } from './menu-definitions'
import type { MenuItemDef } from './menu-definitions'
import type { ShortcutMap } from '../../data/shortcuts'

export interface OperationGroup {
  id: string
  label: string
  actions: string[]
  children?: OperationGroup[]
}

export const QUICK_ACTIONS = ['new', 'open', 'save']
export const OPERATION_GROUPS: OperationGroup[] = [
  { id: 'document', label: '文档与知识库', actions: ['openFolder', 'newWindow', 'commandPalette', 'wsSearch', 'saveAs', 'versionHistory', 'images'],
    children: [{ id: 'tabs', label: '管理标签页', actions: ['closeTab', 'closeOtherTabs', 'closeAllTabs'] }] },
  { id: 'edit', label: '编辑与查找', actions: MENU_DEFS.edit.flatMap((item) => item.action ? [item.action] : []) },
  { id: 'format', label: '排版与插入', actions: ['h1', 'h2', 'h3', 'text'],
    children: [
      { id: 'blocks', label: '列表与内容块', actions: ['ul', 'ol', 'task', 'quote', 'code', 'hr'] },
      { id: 'table', label: '表格操作', actions: ['table', 'tableRow', 'tableCol', 'tableDel'] },
    ] },
  { id: 'export', label: '导出与发布', actions: ['exportPdf', 'exportDocx', 'exportHtml', 'exportMarkdown', 'exportPandoc', 'publish'] },
  { id: 'view', label: '视图与布局', actions: ['toggleSidebar', 'toggleFocus', 'togglePreview', 'typewriter', 'outline', 'linksPanel', 'graph'],
    children: [
      { id: 'layout', label: '布局预设', actions: ['layout.preset.writing', 'layout.preset.knowledge', 'layout.preset.technical-docs', 'layout.preset.publishing'] },
      { id: 'zoom', label: '界面缩放', actions: ['zoomIn', 'zoomOut', 'zoomReset'] },
    ] },
  { id: 'help', label: '帮助与说明', actions: ['shortcuts', 'markdown', 'stats', 'about'] },
]

// 与传统菜单共享动作和快捷键定义，搜索覆盖所有层级，不引入第二份命令实现。
export function operationItems(shortcuts: ShortcutMap): MenuItemDef[] {
  return Object.values(buildMenus(shortcuts)).flat().filter((item) => item.action)
}
