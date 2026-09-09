import { describe, expect, it } from 'vitest'
import { createLatestRequestGuard } from './latest-request'

describe('最新请求守卫', () => {
  it('后发请求使先发请求失效', () => {
    const guard = createLatestRequestGuard()
    const isFirstCurrent = guard.begin()
    const isSecondCurrent = guard.begin()

    expect(isFirstCurrent()).toBe(false)
    expect(isSecondCurrent()).toBe(true)
  })
})
