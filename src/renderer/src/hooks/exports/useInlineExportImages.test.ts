// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInlineExportImages } from './useInlineExportImages'

const installDesktopApi = (readImageInline: (src: string) => Promise<unknown>) => {
  Object.defineProperty(window, 'desktopAPI', {
    configurable: true,
    value: { document: { readImageInline } },
  })
}

describe('useInlineExportImages', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'desktopAPI', { configurable: true, value: undefined })
  })

  it('只把 mdimg:// 图片替换为主进程返回的 dataURL', async () => {
    const readImageInline = vi.fn(async (src: string) => ({
      ok: true,
      data: { dataUrl: `data:image/png;base64,${src.length}` },
    }))
    installDesktopApi(readImageInline)
    const { result } = renderHook(() => useInlineExportImages())

    const html = '<p>x</p><img src="mdimg://a/b.png"><img src="https://example.com/x.png">'
    const out = await result.current.inlineImagesInHtml(html)

    expect(out.failed).toBe(0)
    expect(out.html).toContain('data:image/png;base64,')
    expect(out.html).not.toContain('mdimg://')
    // 外链图片保持原样，不应触发 IPC
    expect(out.html).toContain('https://example.com/x.png')
    expect(readImageInline).toHaveBeenCalledTimes(1)
  })

  it('主进程返回失败时保留原路径并累计 failed', async () => {
    const readImageInline = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'NOT_FOUND' } })
      .mockResolvedValueOnce({ ok: true, data: { dataUrl: 'data:image/png;base64,ok' } })
    installDesktopApi(readImageInline)
    const { result } = renderHook(() => useInlineExportImages())

    const out = await result.current.inlineImagesInHtml(
      '<img src="mdimg://miss.png"><img src="mdimg://ok.png">',
    )

    expect(out.failed).toBe(1)
    // 失败的保留原路径，不静默丢图；成功的替换
    expect(out.html).toContain('mdimg://miss.png')
    expect(out.html).toContain('data:image/png;base64,ok')
  })

  it('IPC 抛错时计入 failed，不影响其他图片', async () => {
    const readImageInline = vi
      .fn()
      .mockRejectedValueOnce(new Error('ipc down'))
      .mockResolvedValueOnce({ ok: true, data: { dataUrl: 'data:image/png;base64,fine' } })
    installDesktopApi(readImageInline)
    const { result } = renderHook(() => useInlineExportImages())

    const out = await result.current.inlineImagesInHtml(
      '<img src="mdimg://a.png"><img src="mdimg://b.png">',
    )

    expect(out.failed).toBe(1)
    expect(out.html).toContain('mdimg://a.png')
    expect(out.html).toContain('data:image/png;base64,fine')
  })

  it('没有 mdimg 图片时不触发 IPC', async () => {
    const readImageInline = vi.fn()
    installDesktopApi(readImageInline)
    const { result } = renderHook(() => useInlineExportImages())

    const out = await result.current.inlineImagesInHtml('<p>纯文本</p>')

    expect(out.failed).toBe(0)
    expect(out.html).toBe('<p>纯文本</p>')
    expect(readImageInline).not.toHaveBeenCalled()
  })

  it('desktopAPI 缺失时不抛错，failed 计数覆盖所有 mdimg 图片', async () => {
    // 未安装 desktopAPI：模拟非 Electron 环境（例如单元测试或 Web 预览）
    const { result } = renderHook(() => useInlineExportImages())
    const out = await result.current.inlineImagesInHtml('<img src="mdimg://a.png">')
    expect(out.failed).toBe(1)
    expect(out.html).toContain('mdimg://a.png')
  })
})
