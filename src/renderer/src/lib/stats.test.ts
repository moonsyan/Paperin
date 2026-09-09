import { describe, expect, it } from 'vitest'
import { estimateReadMinutes } from './stats'

describe('estimateReadMinutes', () => {
  it('空文本返回 0 分钟', () => {
    expect(estimateReadMinutes('')).toBe(0)
    expect(estimateReadMinutes('   \n  ')).toBe(0)
  })

  it('纯中文按字符估算（500 字/分钟）', () => {
    // 500 个汉字 ≈ 1 分钟
    expect(estimateReadMinutes('字'.repeat(500))).toBe(1)
    expect(estimateReadMinutes('字'.repeat(1000))).toBe(2)
  })

  it('纯英文按词估算（250 词/分钟）', () => {
    const words = Array.from({ length: 250 }, () => 'word').join(' ')
    expect(estimateReadMinutes(words)).toBe(1)
    const words500 = Array.from({ length: 500 }, () => 'word').join(' ')
    expect(estimateReadMinutes(words500)).toBe(2)
  })

  it('中英混合折算合理（不大量高估）', () => {
    // 250 个汉字 + 125 个英文词 ≈ 1 分钟
    const mixed = `${'字'.repeat(250)} ${Array.from({ length: 125 }, () => 'word').join(' ')}`
    expect(estimateReadMinutes(mixed)).toBe(1)
  })

  it('标点与数字不产生虚增', () => {
    expect(estimateReadMinutes(' ,,, ,,, 1234567890')).toBe(1)
  })
})
