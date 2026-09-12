import { sharedPanelRegistry } from '../../app/panels/shared-panel-registry'
import type { PanelContext, PanelRegistry } from '../../app/panels/panel-registry'

export interface EditorMarginProps {
  context: PanelContext
  /** editor.margin 插槽的面板注册表；缺省消费应用级共享注册表 */
  registry?: PanelRegistry
}

/**
 * 正文页边插槽宿主：消费 PanelRegistry 的 editor.margin 面板。
 *
 * 默认注册表不内置 editor.margin 面板（属性/关联笔记/版本信息由 ContextDock
 * 承载，见 QUIET-WORKSPACE-EVALUATION 的决策），本宿主是扩展点：向注册表
 * 注册带 render 的 editor.margin 面板即可在正文旁出现，无需改动编辑器。
 * 无可用面板时不渲染任何 DOM，不改变现有布局。
 */
export function EditorMargin({ context, registry = sharedPanelRegistry }: EditorMarginProps): JSX.Element | null {
  const panels = registry
    .list('editor.margin', context)
    .filter((panel) => typeof panel.render === 'function')

  if (panels.length === 0) return null

  return (
    <div className="editor-margin" role="complementary" aria-label="正文页边">
      {panels.map((panel) => (
        <section key={panel.id} className="editor-margin-panel" aria-label={panel.title}>
          {panel.render?.(context)}
        </section>
      ))}
    </div>
  )
}
