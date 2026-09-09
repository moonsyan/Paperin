import { describe, expect, it } from 'vitest'
import { openOverlay } from './overlay-state'
import type { OverlayState } from './overlay-state'

describe('openOverlay', () => {
  it('互斥弹窗状态不会同时打开两个主弹窗', () => {
    expect(openOverlay({ type: 'settings' }, { type: 'search', replace: false })).toEqual({
      type: 'search',
      replace: false,
    })
  })

  it('null 作为当前状态时直接打开目标弹窗', () => {
    expect(openOverlay(null, { type: 'settings' })).toEqual({ type: 'settings' })
  })

  it('confirm 弹窗携带请求载荷整体替换', () => {
    const request = { title: '删除确认', message: '确认删除？', danger: true }
    const current: OverlayState = { type: 'history', fileId: 'f1' }
    expect(openOverlay(current, { type: 'confirm', request })).toEqual({ type: 'confirm', request })
  })

  it('history 弹窗携带文件 id 整体替换', () => {
    expect(openOverlay(null, { type: 'history', fileId: 'doc-1' })).toEqual({
      type: 'history',
      fileId: 'doc-1',
    })
  })
})
