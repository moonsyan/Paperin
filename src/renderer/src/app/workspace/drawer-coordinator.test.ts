import { describe, expect, it } from 'vitest'
import {
  closeDrawerOverlay,
  onNarrowEnter,
  onNarrowExit,
  openDrawerOverlay,
  resolveDrawerVisibility,
} from './drawer-coordinator'

describe('openDrawerOverlay（最近打开者获胜）', () => {
  it('打开侧栏覆盖 dock', () => {
    expect(openDrawerOverlay('dock', 'sidebar')).toBe('sidebar')
  })
  it('打开 dock 覆盖侧栏', () => {
    expect(openDrawerOverlay('sidebar', 'dock')).toBe('dock')
  })
  it('从无 overlay 打开', () => {
    expect(openDrawerOverlay(null, 'sidebar')).toBe('sidebar')
  })
})

describe('closeDrawerOverlay', () => {
  it('清空瞬时 overlay', () => {
    expect(closeDrawerOverlay('sidebar')).toBeNull()
    expect(closeDrawerOverlay(null)).toBeNull()
  })
})

describe('onNarrowEnter（进入窄窗口初始化）', () => {
  it('两侧偏好都开：保留侧栏（主导航优先）', () => {
    expect(onNarrowEnter(true, true)).toBe('sidebar')
  })
  it('只有 dock 偏好开：overlay 为 dock', () => {
    expect(onNarrowEnter(false, true)).toBe('dock')
  })
  it('都关闭：无 overlay', () => {
    expect(onNarrowEnter(false, false)).toBeNull()
  })
})

describe('onNarrowExit', () => {
  it('离开窄窗口 overlay 失效', () => {
    expect(onNarrowExit()).toBeNull()
  })
})

describe('resolveDrawerVisibility', () => {
  it('宽窗口：直接用持久化偏好', () => {
    expect(resolveDrawerVisibility(false, null, true, false)).toEqual({ sidebar: true, dock: false })
    expect(resolveDrawerVisibility(false, 'dock', true, true)).toEqual({ sidebar: true, dock: true })
  })
  it('窄窗口：只有 overlay 指向者可见', () => {
    expect(resolveDrawerVisibility(true, 'sidebar', true, true)).toEqual({ sidebar: true, dock: false })
    expect(resolveDrawerVisibility(true, 'dock', true, true)).toEqual({ sidebar: false, dock: true })
  })
  it('窄窗口无 overlay：都不可见（等待用户打开动作）', () => {
    expect(resolveDrawerVisibility(true, null, true, true)).toEqual({ sidebar: false, dock: false })
  })
})
