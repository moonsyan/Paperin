import { describe, expect, it } from 'vitest'
import { isGpuFallbackRequested } from './gpu-fallback'

describe('isGpuFallbackRequested', () => {
  it('启用环境变量时请求软栅', () => {
    expect(isGpuFallbackRequested({ PAPERIN_DISABLE_GPU: '1' }, () => false)).toBe(true)
  })

  it('存在标记文件时请求软栅', () => {
    expect(isGpuFallbackRequested({}, () => true)).toBe(true)
  })

  it('默认不请求软栅', () => {
    expect(isGpuFallbackRequested({}, () => false)).toBe(false)
  })
})
