import type { ReactNode } from 'react'

import { isPanelId } from '../../../../shared/panel-id'
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
  /** 容器由 ContextDock 负责；入口只返回可渲染内容。 */
  render?: (context: PanelContext) => ReactNode
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
      if (!isPanelId(panel.id)) {
        throw new Error(`[panels] 面板 ID 无效：${panel.id}`)
      }
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

/** 内置面板的稳定注册；扩展面板可在应用装配层追加注册。 */
export const createDefaultPanelRegistry = (): PanelRegistry => {
  const registry = createPanelRegistry()
  // sidebar.primary：侧栏主区域（文件树等一等导航）
  registry.register({ id: 'files', slot: 'sidebar.primary', title: '文件', order: 10 })
  // sidebar.secondary：ContextDock 面板
  registry.register({ id: 'outline', slot: 'sidebar.secondary', title: '大纲', order: 10, scope: 'document' })
  registry.register({ id: 'links', slot: 'sidebar.secondary', title: '关系', order: 20, scope: 'workspace' })
  registry.register({ id: 'tags', slot: 'sidebar.secondary', title: '标签', order: 30, scope: 'workspace' })
  registry.register({ id: 'properties', slot: 'sidebar.secondary', title: '属性', order: 40, scope: 'document' })
  registry.register({ id: 'quality', slot: 'sidebar.secondary', title: '检查', order: 50, scope: 'workspace' })
  // editor.margin：正文页边插槽。默认不注册内置面板（属性/关联笔记/版本信息
  // 由 ContextDock 承载），作为扩展点由 EditorMargin 宿主消费。
  // statusbar.end：状态栏右侧条目，顺序即注册面板顺序
  registry.register({ id: 'status.modified', slot: 'statusbar.end', title: '修改时间', order: 10 })
  registry.register({ id: 'status.cursor', slot: 'statusbar.end', title: '光标位置', order: 20 })
  registry.register({ id: 'status.selection', slot: 'statusbar.end', title: '选中字数', order: 30 })
  registry.register({ id: 'status.section', slot: 'statusbar.end', title: '章节字数', order: 40 })
  registry.register({ id: 'status.goal', slot: 'statusbar.end', title: '字数目标', order: 50 })
  registry.register({ id: 'status.words', slot: 'statusbar.end', title: '字数', order: 60 })
  registry.register({ id: 'status.lines', slot: 'statusbar.end', title: '行数', order: 70 })
  registry.register({ id: 'status.readtime', slot: 'statusbar.end', title: '阅读时长', order: 80 })
  registry.register({ id: 'status.encoding', slot: 'statusbar.end', title: '编码', order: 90 })
  registry.register({ id: 'status.language', slot: 'statusbar.end', title: '语言', order: 100 })
  return registry
}
