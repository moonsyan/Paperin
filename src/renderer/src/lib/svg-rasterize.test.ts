// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rasterizeSvgToPngDataUrl } from './svg-rasterize'

/**
 * jsdom 不实现 Image 解码，onload/onerror 都不会稳定触发，因此这里只覆盖
 * 与浏览器 API 无关的错误分支。真实光栅化在 Electron smoke 里通过 Word
 * 导出走完整链路验证。
 */
describe('rasterizeSvgToPngDataUrl', () => {
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  it('createObjectURL 抛错时 Promise 化返回 null（不冒泡到调用方）', async () => {
    URL.createObjectURL = vi.fn(() => {
      throw new Error('blob unavailable')
    })
    const result = await rasterizeSvgToPngDataUrl('<svg></svg>')
    expect(result).toBeNull()
  })

  it('Blob 构造抛错时同样返回 null', async () => {
    const originalBlob = globalThis.Blob
    const throwingBlob = function () {
      throw new Error('blob ctor down')
    } as unknown as typeof Blob
    globalThis.Blob = throwingBlob
    try {
      const result = await rasterizeSvgToPngDataUrl('<svg></svg>')
      expect(result).toBeNull()
    } finally {
      globalThis.Blob = originalBlob
    }
  })
})
