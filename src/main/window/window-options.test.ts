import { describe, expect, it } from 'vitest'
import { getMainWindowPlacement } from './window-options'

describe('主窗口初始位置', () => {
  it('居中显示且不使用桌面层或置顶行为', () => {
    expect(getMainWindowPlacement()).toEqual({
      width: 1200,
      height: 800,
      minWidth: 680,
      minHeight: 480,
      center: true,
      alwaysOnTop: false,
      skipTaskbar: false,
    })
  })
})
