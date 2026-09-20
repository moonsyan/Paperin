import { describe, expect, it } from 'vitest'
import {
  decodeUtf16BeStrict,
  decodeUtf16LeStrict,
  decodeUtf8Strict,
  hasLoneSurrogates,
} from './text-decoding'

describe('text-decoding', () => {
  it('严格 UTF-8 拒绝残缺多字节序列', () => {
    const broken = Buffer.from('中文笔记', 'utf8').subarray(0, -1)
    expect(() => decodeUtf8Strict(broken)).toThrow()
  })

  it('识别孤立代理项', () => {
    expect(hasLoneSurrogates('\uD800')).toBe(true)
    expect(hasLoneSurrogates('\uD800\uDC00')).toBe(false)
    expect(hasLoneSurrogates('𠮷')).toBe(false)
  })

  it('UTF-16LE 奇数字节拒绝', () => {
    expect(() => decodeUtf16LeStrict(Buffer.from([0x61, 0x00, 0x62]))).toThrow()
  })

  it('UTF-16BE 奇数字节拒绝', () => {
    expect(() => decodeUtf16BeStrict(Buffer.from([0x00, 0x61, 0x00]))).toThrow()
  })
})
