import { describe, expect, it } from 'vitest'
import { MENU_DEFS } from './menu-definitions'
import { OPERATION_GROUPS, QUICK_ACTIONS, operationItems } from './compact-menu-model'
import type { OperationGroup } from './compact-menu-model'

describe('更多菜单能力映射', () => {
  it('所有原菜单动作均可从分类找到，各分类不超过 11 项', () => {
    const collect = (groups: OperationGroup[]): string[] => groups.flatMap((group) => {
      expect(group.actions.length + (group.children?.length ?? 0)).toBeLessThanOrEqual(11)
      return [...group.actions, ...collect(group.children ?? [])]
    })
    const actions = [...QUICK_ACTIONS, 'settings', ...collect(OPERATION_GROUPS)]
    const original = Object.values(MENU_DEFS).flat().flatMap((item) => item.action ? [item.action] : [])
    expect(actions.sort()).toEqual(original.sort())
  })
  it('搜索使用全量动作，尊重用户快捷键解绑，不包含最近文件', () => {
    const items = operationItems({ save: '' })
    expect(items.find((item) => item.action === 'save')?.shortcut).toBe('')
    expect(items.some((item) => item.action === 'tableDel')).toBe(true)
    expect(items.some((item) => item.action?.startsWith('openRecent:'))).toBe(false)
  })
})
