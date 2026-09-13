import type { ShortcutMap } from '../../data/shortcuts'

export interface MenuItemDef {
  label: string
  shortcut?: string
  action?: string
  separator?: boolean
}

export const MENU_DEFS: Record<string, MenuItemDef[]> = {
  file: [
    { label: '新建文档', shortcut: 'Ctrl+N', action: 'new' },
    { label: '新建窗口', action: 'newWindow' },
    { label: '打开文件', shortcut: 'Ctrl+O', action: 'open' },
    { label: '打开文件夹', shortcut: 'Ctrl+Shift+O', action: 'openFolder' },
    { label: '快速打开…', action: 'commandPalette' },
    { label: '全工作区搜索…', action: 'wsSearch' },
    { label: '保存', shortcut: 'Ctrl+S', action: 'save' },
    { label: '另存为', shortcut: 'Ctrl+Shift+S', action: 'saveAs' },
    { label: '版本历史…', action: 'versionHistory' },
    { label: '', separator: true },
    { label: '关闭标签页', shortcut: 'Ctrl+W', action: 'closeTab' },
    { label: '关闭其他标签页', action: 'closeOtherTabs' },
    { label: '关闭全部标签页', action: 'closeAllTabs' },
    { label: '', separator: true },
    { label: '偏好设置…', action: 'settings' },
    { label: '', separator: true },
    { label: '导出 PDF', action: 'exportPdf' },
    { label: '导出 Word (.docx)', action: 'exportDocx' },
    { label: '导出 HTML', action: 'exportHtml' },
    { label: '导出 Markdown', action: 'exportMarkdown' },
    { label: '导出 EPUB / LaTeX…（pandoc）', action: 'exportPandoc' },
    { label: '发布…（模板 / 资源包 / 富文本）', action: 'publish' },
    { label: '', separator: true },
    { label: '图片管理…', action: 'images' },
  ],
  edit: [
    { label: '撤销', shortcut: 'Ctrl+Z', action: 'undo' },
    { label: '重做', shortcut: 'Ctrl+Shift+Z', action: 'redo' },
    { label: '', separator: true },
    { label: '粗体', shortcut: 'Ctrl+B', action: 'bold' },
    { label: '斜体', shortcut: 'Ctrl+I', action: 'italic' },
    { label: '删除线', shortcut: 'Ctrl+Shift+X', action: 'strike' },
    { label: '插入链接', shortcut: 'Ctrl+K', action: 'insertLink' },
    { label: '插入图片', shortcut: 'Ctrl+Alt+I', action: 'insertImage' },
    { label: '', separator: true },
    { label: '查找', shortcut: 'Ctrl+F', action: 'find' },
    { label: '替换', shortcut: 'Ctrl+H', action: 'replace' },
  ],
  para: [
    { label: '标题 1', shortcut: 'Ctrl+1', action: 'h1' },
    { label: '标题 2', shortcut: 'Ctrl+2', action: 'h2' },
    { label: '标题 3', shortcut: 'Ctrl+3', action: 'h3' },
    { label: '正文', shortcut: 'Ctrl+0', action: 'text' },
    { label: '', separator: true },
    { label: '无序列表', action: 'ul' },
    { label: '有序列表', action: 'ol' },
    { label: '任务列表', action: 'task' },
    { label: '', separator: true },
    { label: '引用', action: 'quote' },
    { label: '代码块', action: 'code' },
    { label: '表格', action: 'table' },
    { label: '表格加行（下方）', action: 'tableRow' },
    { label: '表格加列（右侧）', action: 'tableCol' },
    { label: '删除选中单元格', action: 'tableDel' },
    { label: '分割线', action: 'hr' },
  ],
  view: [
    { label: '切换侧栏', shortcut: 'Ctrl+J', action: 'toggleSidebar' },
    { label: '专注模式', shortcut: 'F11', action: 'toggleFocus' },
    { label: '分栏预览', shortcut: 'Ctrl+Shift+P', action: 'togglePreview' },
    { label: '', separator: true },
    { label: '打字机模式', action: 'typewriter' },
    { label: '大纲面板', shortcut: 'Ctrl+Shift+L', action: 'outline' },
    { label: '链接面板', action: 'linksPanel' },
    { label: '知识图谱…', action: 'graph' },
    { label: '', separator: true },
    // 布局预设（Task 7A）：只切换面板视图/侧栏宽度/打字机开关，不动文档与标签
    { label: '布局预设：写作', action: 'layout.preset.writing' },
    { label: '布局预设：知识库', action: 'layout.preset.knowledge' },
    { label: '布局预设：技术文档', action: 'layout.preset.technical-docs' },
    { label: '布局预设：出版', action: 'layout.preset.publishing' },
    { label: '', separator: true },
    { label: '放大', shortcut: 'Ctrl+=', action: 'zoomIn' },
    { label: '缩小', shortcut: 'Ctrl+-', action: 'zoomOut' },
    { label: '重置缩放', action: 'zoomReset' },
  ],
  help: [
    { label: '快捷键一览', action: 'shortcuts' },
    { label: 'Markdown 语法', action: 'markdown' },
    { label: '写作统计…', action: 'stats' },
    { label: '', separator: true },
    { label: '关于 Paperin', action: 'about' },
  ],
}

export const MENU_LABELS: Record<string, string> = {
  file: '文件',
  edit: '编辑',
  para: '段落',
  view: '视图',
  help: '帮助',
}


export function buildMenus(shortcuts: ShortcutMap, recentFiles: ReadonlyArray<{ name: string; path: string }> = []): Record<string, MenuItemDef[]> {
  const defs: Record<string, MenuItemDef[]> = {}
  for (const key of Object.keys(MENU_DEFS)) {
    defs[key] = MENU_DEFS[key].map((item) =>
      item.action
        ? {
            ...item,
            // 在可自定义映射内的动作：用用户值（空串=已解绑，不显示）；
            // 不在映射内（撤销/粗体等编辑器内置 keymap）保留静态默认值
            shortcut:
              item.action in shortcuts
                ? (shortcuts[item.action] ?? '')
                : item.shortcut,
          }
        : item,
    )
  }
  if (recentFiles.length > 0) {
    const fileItems = [...defs.file]
    // 找到"打开文件夹"的位置，在其后插入最近文件
    const idx = fileItems.findIndex((i) => i.action === 'openFolder')
    const recent: MenuItemDef[] = [
      { label: '', separator: true },
      ...recentFiles.map((r) => ({
        label: r.name,
        action: `openRecent:${r.path}`,
      })),
    ]
    fileItems.splice(idx + 1, 0, ...recent)
    defs.file = fileItems
  }
  return defs
}
