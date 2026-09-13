import { SidebarTree } from './SidebarTree'
import type { SidebarTreeProps } from './SidebarTree'
import type { UiNode } from './fileTree'
import type { SidebarProps } from './types'
import type { PanelContext, PanelDefinition } from '../../app/panels/panel-registry'

export const FILES_PANEL_ID = 'files'

interface SidebarFilesPanelProps {
  panel: PanelDefinition
  context: PanelContext
  nodes: UiNode[]
  externalNodes: UiNode[]
  treeProps: Omit<SidebarTreeProps, 'nodes'>
  tagFilter: SidebarProps['tagFilter']
  onClearTagFilter: SidebarProps['onClearTagFilter']
}

/** 文件面板负责树、筛选提示和外部文件分组；扩展面板沿用注册表插槽。 */
export function SidebarFilesPanel({ panel, context, nodes, externalNodes, treeProps, tagFilter, onClearTagFilter }: SidebarFilesPanelProps): JSX.Element | null {
  if (panel.render) {
    return <div className="panel active sidebar-custom-panel" role="tabpanel" aria-label={panel.title}>{panel.render(context)}</div>
  }
  if (panel.id !== FILES_PANEL_ID) return null
  return (
    <div className="panel active" role="tabpanel" aria-label={panel.title}>
      {tagFilter && (
        <div className="tree-filter-banner">
          <span className="tree-filter-label">#{tagFilter.tag}（{tagFilter.paths.length}）</span>
          <button type="button" className="tree-filter-clear" onClick={() => onClearTagFilter?.()} aria-label="清除标签筛选" title="清除标签筛选">✕</button>
        </div>
      )}
      <div role="tree" aria-label="文件列表">
        {context.hasWorkspace && nodes.length === 0
          ? <div className="tree-empty">{tagFilter ? '没有包含该标签的文件' : '文件夹为空，已新建空白文档'}</div>
          : <SidebarTree nodes={nodes} {...treeProps} />}
        {externalNodes.length > 0 && (
          <div className="tree-external-group" role="group" aria-label="外部文件">
            <div className="tree-section-label">外部文件</div>
            <SidebarTree nodes={externalNodes} {...treeProps} />
          </div>
        )}
      </div>
    </div>
  )
}
