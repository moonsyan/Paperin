import type { AppCommand } from '../../commands/app-command'
import type { DocumentTemplate } from '../../../lib/document-collection'
import type { ActionHandlersRef } from './types'

const TEMPLATE_KEYWORDS: Partial<Record<DocumentTemplate, readonly string[]>> = {
  article: ['模板', '技术说明', '技术文章', '项目文档'],
  decision: ['模板', '决策', 'ADR'],
}

const TEMPLATES: DocumentTemplate[] = ['readme', 'api', 'design', 'changelog', 'article', 'decision']

const TEMPLATE_TITLES: Record<DocumentTemplate, string> = {
  readme: '新建 README 模板文档',
  api: '新建 API 文档模板',
  design: '新建设计文档模板',
  changelog: '新建更新日志模板',
  article: '新建技术文章模板',
  decision: '新建决策记录模板',
}

/**
 * 文件域命令：新建/打开/保存另存/标签关闭/导出/发布/图片/模板。
 *
 * 焦点策略对应历史行为：
 * - 原生对话框动作（open/openFolder/saveAs/export*）用 `settle`：等 promise
 *   结束（对话框关闭）再聚焦编辑器，取消对话框的路径也能落回编辑器；
 * - images/publish/exportPdf 用 `never`：它们各自打开对话框接管焦点。
 */
export const createFileCommands = (handlers: ActionHandlersRef): AppCommand[] => [
  {
    id: 'new',
    title: '新建文档',
    enabled: () => true,
    execute: () => handlers.current.handleNew(),
  },
  {
    id: 'newWindow',
    title: '新建窗口',
    enabled: () => true,
    execute: () => {
      void window.desktopAPI?.window.newWindow()
    },
  },
  {
    id: 'open',
    title: '打开文件',
    focusEditor: 'settle',
    enabled: () => true,
    execute: () => handlers.current.handleOpen(),
  },
  {
    id: 'openFolder',
    title: '打开文件夹',
    focusEditor: 'settle',
    enabled: () => true,
    execute: () => handlers.current.handleOpenFolder(),
  },
  {
    id: 'saveAs',
    title: '另存为',
    focusEditor: 'settle',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.handleSaveAs(),
  },
  {
    id: 'closeTab',
    title: '关闭当前标签页',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.handleCloseTab(handlers.current.activeFileIdRef.current),
  },
  {
    id: 'closeOtherTabs',
    title: '关闭其他标签页',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.handleCloseOtherTabs(handlers.current.activeFileIdRef.current),
  },
  {
    id: 'closeAllTabs',
    title: '关闭全部标签页',
    enabled: () => true,
    execute: () => handlers.current.handleCloseAllTabs(),
  },
  {
    id: 'images',
    title: '图片管理',
    focusEditor: 'never',
    enabled: () => true,
    execute: () => handlers.current.setImagesOpen(true),
  },
  {
    id: 'publish',
    title: '发布',
    focusEditor: 'never',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.setPublishOpen(true),
  },
  {
    id: 'exportPdf',
    title: '导出 PDF',
    focusEditor: 'never',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.setPdfOptsOpen(true),
  },
  {
    id: 'exportHtml',
    title: '导出 HTML',
    focusEditor: 'settle',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.handleExportHtml(),
  },
  {
    id: 'exportMarkdown',
    title: '导出 Markdown',
    focusEditor: 'settle',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.handleExportMarkdown(),
  },
  {
    id: 'exportDocx',
    title: '导出 DOCX',
    focusEditor: 'settle',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.handleExportDocx(),
  },
  {
    id: 'exportPandoc',
    title: '导出（Pandoc）',
    focusEditor: 'settle',
    scope: 'document',
    enabled: () => true,
    execute: () => handlers.current.handleExportPandoc(),
  },
  ...TEMPLATES.map(
    (template): AppCommand => ({
      id: `newTemplate:${template}`,
      title: TEMPLATE_TITLES[template],
      keywords: TEMPLATE_KEYWORDS[template],
      enabled: () => true,
      execute: () => handlers.current.handleNewFromTemplate?.(template),
    }),
  ),
]
