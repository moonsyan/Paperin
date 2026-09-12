import { describe, expect, it } from 'vitest'
import {
  createDefaultPanelRegistry,
  createPanelRegistry,
  type PanelContext,
} from './panel-registry'

const context: PanelContext = {
  activeFileId: 'file',
  hasWorkspace: true,
}

describe('panel registry', () => {
  it('lists panels by slot and stable order', () => {
    const registry = createPanelRegistry()
    registry.register({ id: 'tags', slot: 'sidebar.secondary', title: '标签', order: 20 })
    registry.register({ id: 'outline', slot: 'sidebar.secondary', title: '大纲', order: 10 })
    registry.register({ id: 'links', slot: 'sidebar.primary', title: '关系', order: 1 })

    expect(registry.list('sidebar.secondary', context).map((panel) => panel.id)).toEqual(['outline', 'tags'])
    expect(registry.list('sidebar.primary', context).map((panel) => panel.id)).toEqual(['links'])
  })

  it('filters disabled panels and provides deterministic lookup', () => {
    const registry = createPanelRegistry()
    registry.register({ id: 'quality', slot: 'statusbar.end', title: '检查', enabled: (ctx) => ctx.hasWorkspace })
    expect(registry.get('quality')?.title).toBe('检查')
    expect(registry.list('statusbar.end', { ...context, hasWorkspace: false })).toEqual([])
    expect(registry.unregister('quality')).toBe(true)
    expect(registry.get('quality')).toBeUndefined()
    expect(registry.unregister('quality')).toBe(false)
  })

  it('replaces duplicate ids while retaining the newest registration', () => {
    const registry = createPanelRegistry()
    registry.register({ id: 'outline', slot: 'sidebar.primary', title: '旧大纲' })
    expect(() => registry.register({ id: 'outline', slot: 'sidebar.secondary', title: '新大纲' })).toThrow(/outline/)
    expect(registry.get('outline')?.title).toBe('新大纲')
    expect(registry.list('sidebar.secondary', context).map((panel) => panel.id)).toEqual(['outline'])
  })

  it('rejects panel ids that are unsafe to persist or use in DOM ids', () => {
    const registry = createPanelRegistry()
    expect(() => registry.register({
      id: '../unsafe',
      slot: 'sidebar.secondary',
      title: '不安全面板',
    })).toThrow(/ID 无效/)
    expect(registry.list('sidebar.secondary', context)).toEqual([])
  })

  it('scopes default panels to the available document and workspace context', () => {
    const registry = createDefaultPanelRegistry()
    expect(
      registry
        .list('sidebar.secondary', { activeFileId: 'external', hasWorkspace: false })
        .map((panel) => panel.id),
    ).toEqual(['outline', 'properties'])
    expect(
      registry
        .list('sidebar.secondary', { activeFileId: '', hasWorkspace: true })
        .map((panel) => panel.id),
    ).toEqual(['links', 'tags', 'quality'])
  })

  it('default registry covers all four panel slots', () => {
    const registry = createDefaultPanelRegistry()
    expect(registry.list('sidebar.primary', context).map((panel) => panel.id)).toEqual(['files'])
    expect(registry.list('sidebar.secondary', context).map((panel) => panel.id)).toEqual([
      'outline', 'links', 'tags', 'properties', 'quality',
    ])
    // editor.margin 默认无内置面板：作为扩展点由 EditorMargin 宿主消费
    expect(registry.list('editor.margin', context)).toEqual([])
    expect(registry.list('statusbar.end', context).map((panel) => panel.id)).toEqual([
      'status.modified',
      'status.cursor',
      'status.selection',
      'status.section',
      'status.goal',
      'status.words',
      'status.lines',
      'status.readtime',
      'status.encoding',
      'status.language',
    ])
  })
})
