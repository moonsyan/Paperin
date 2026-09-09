import { describe, expect, it } from 'vitest'
import { isWindowCapacityAvailable } from './window-capacity'

describe('窗口数量限制', () => {
  it('少于八个窗口时允许新建，达到上限时拒绝', () => {
    expect(isWindowCapacityAvailable(7)).toBe(true)
    expect(isWindowCapacityAvailable(8)).toBe(false)
  })
})
