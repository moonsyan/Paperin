import { isCommandAvailable } from '../commands/command-context'
import type { CommandScope } from '../commands/command-context'

export type PanelSlot =
  | 'sidebar.primary'
  | 'sidebar.secondary'
  | 'editor.margin'
  | 'statusbar.end'

export interface PanelContext {
  activeFileId: string
  hasWorkspace: boolean
  hasUnsavedChanges?: boolean
  source?: CommandScope
}

export interface PanelDefinition {
  id: string
  title: string
  slot: PanelSlot
  order?: number
  scope?: CommandScope
  enabled?: (context: PanelContext) => boolean
  /** 容器由 React 负责；注册表只保存窄化的渲染入口。 */
  render?: (context: PanelContext) => unknown
}

export interface PanelRegistry {
  register(panel: PanelDefinition): void
  unregister(id: string): boolean
  get(id: string): PanelDefinition | undefined
  list(slot: PanelSlot, context: PanelContext): PanelDefinition[]
}

const isDevBuild = (): boolean => process.env.NODE_ENV !== 'production'

export const createPanelRegistry = (): PanelRegistry => {
  const panels = new Map<string, PanelDefinition>()
  const sequence = new Map<string, number>()
  let nextSequence = 0

  return {
    register(panel) {
      const duplicated = panels.has(panel.id)
      panels.set(panel.id, panel)
      if (!sequence.has(panel.id)) sequence.set(panel.id, nextSequence++)
      if (duplicated && isDevBuild()) {
        throw new Error(`[panels] 面板 ${panel.id} 已存在，已覆盖注册`)
      }
    },

    unregister(id) {
      const removed = panels.delete(id)
      if (removed) sequence.delete(id)
      return removed
    },

    get(id) {
      return panels.get(id)
    },

    list(slot, context) {
      return Array.from(panels.values())
        .filter((panel) =>
          panel.slot === slot &&
          (panel.enabled?.(context) ?? true) &&
          (!panel.scope || isCommandAvailable(context, { requires: panel.scope })),
        )
        .sort((left, right) =>
          (left.order ?? 0) - (right.order ?? 0) ||
          (sequence.get(left.id) ?? 0) - (sequence.get(right.id) ?? 0),
        )
    },
  }
}

/** 内置 ContextDock 面板的稳定注册；扩展面板可在应用装配层追加注册。 */
export const createDefaultPanelRegistry = (): PanelRegistry => {
  const registry = createPanelRegistry()
  registry.register({ id: 'outline', slot: 'sidebar.secondary', title: '大纲', order: 10 })
  registry.register({ id: 'links', slot: 'sidebar.secondary', title: '关系', order: 20 })
  registry.register({ id: 'tags', slot: 'sidebar.secondary', title: '标签', order: 30 })
  registry.register({ id: 'properties', slot: 'sidebar.secondary', title: '属性', order: 40 })
  registry.register({ id: 'quality', slot: 'sidebar.secondary', title: '检查', order: 50 })
  return registry
}
