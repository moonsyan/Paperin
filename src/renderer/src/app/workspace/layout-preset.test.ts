import { describe, expect, it } from 'vitest'
import {
  applyLayoutPreset,
  BUILT_IN_LAYOUT_PRESETS,
  parseCustomPresets,
  serializeCustomPresets,
} from './layout-preset'
import type { LayoutPreset } from './layout-preset'

const CURRENT = {
  activeView: 'tags' as const,
  sidebarWidth: 320,
  typewriterMode: false,
}

describe('BUILT_IN_LAYOUT_PRESETS', () => {
  it('四个内置预设字段完整且 id 唯一', () => {
    expect(BUILT_IN_LAYOUT_PRESETS.map((p) => p.id)).toEqual([
      'writing',
      'knowledge',
      'technical-docs',
      'publishing',
    ])
    const ids = new Set(BUILT_IN_LAYOUT_PRESETS.map((p) => p.id))
    expect(ids.size).toBe(BUILT_IN_LAYOUT_PRESETS.length)
    for (const preset of BUILT_IN_LAYOUT_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0)
      expect(typeof preset.sidebarWidth).toBe('number')
      expect(typeof preset.toggles).toBe('object')
    }
  })

  it('预设语义：写作=大纲+打字机开；知识库=文件树；技术文档=文件树+打字机关；出版=大纲', () => {
    const byId = Object.fromEntries(BUILT_IN_LAYOUT_PRESETS.map((p) => [p.id, p]))
    expect(byId.writing.activeView).toBe('outline')
    expect(byId.writing.toggles.typewriterMode).toBe(true)
    expect(byId.knowledge.activeView).toBe('files')
    expect(byId['technical-docs'].activeView).toBe('files')
    expect(byId['technical-docs'].toggles.typewriterMode).toBe(false)
    expect(byId.publishing.activeView).toBe('outline')
  })

  it('预设不携带文档数据：只有视图/宽度/开关字段', () => {
    for (const preset of BUILT_IN_LAYOUT_PRESETS) {
      expect(Object.keys(preset).sort()).toEqual(['activeView', 'id', 'name', 'sidebarWidth', 'toggles'])
    }
  })
})

describe('applyLayoutPreset', () => {
  it('null 字段保持现状，显式字段生效', () => {
    const keep = applyLayoutPreset(
      { id: 'x', name: 'x', activeView: null, sidebarWidth: null, toggles: {} },
      CURRENT,
    )
    expect(keep).toEqual(CURRENT)

    const applied = applyLayoutPreset(
      { id: 'writing', name: '写作', activeView: 'outline', sidebarWidth: 280, toggles: { typewriterMode: true } },
      CURRENT,
    )
    expect(applied).toEqual({ activeView: 'outline', sidebarWidth: 280, typewriterMode: true })
  })

  it('未开打字机的预设通过 toggles 显式关闭', () => {
    const applied = applyLayoutPreset(
      { id: 't', name: 't', activeView: null, sidebarWidth: null, toggles: { typewriterMode: false } },
      { ...CURRENT, typewriterMode: true },
    )
    expect(applied.typewriterMode).toBe(false)
  })

  it('未知 toggle key 被忽略且不抛错', () => {
    expect(() =>
      applyLayoutPreset(
        {
          id: 'future',
          name: 'future',
          activeView: null,
          sidebarWidth: null,
          toggles: { graphPanel: true, qualityPanel: false } as Record<string, boolean>,
        },
        CURRENT,
      ),
    ).not.toThrow()
    expect(applyLayoutPreset(
      {
        id: 'future',
        name: 'future',
        activeView: null,
        sidebarWidth: null,
        toggles: { graphPanel: true } as Record<string, boolean>,
      },
      CURRENT,
    )).toEqual(CURRENT)
  })

  it('输出只包含布局字段，不包含任何标签或文档状态', () => {
    const applied = applyLayoutPreset(BUILT_IN_LAYOUT_PRESETS[0], CURRENT)
    expect(Object.keys(applied).sort()).toEqual(['activeView', 'sidebarWidth', 'typewriterMode'])
  })
})

describe('自定义预设序列化（未知字段保留）', () => {
  it('serialize → parse 往返一致，未知字段保留以便后续面板扩展', () => {
    const custom: LayoutPreset[] = [
      { id: 'custom-1', name: '我的布局', activeView: 'tags', sidebarWidth: 300, toggles: { typewriterMode: true, futurePanel: true } },
    ]
    const parsed = parseCustomPresets(JSON.parse(JSON.stringify(serializeCustomPresets(custom))))
    expect(parsed).toEqual(custom)
  })

  it('损坏数据安全回退为空数组，不抛错', () => {
    expect(parseCustomPresets(null)).toEqual([])
    expect(parseCustomPresets('x')).toEqual([])
    expect(parseCustomPresets([42, { noName: true }, { id: 'ok', name: 'ok' }])).toEqual([])
  })
})
