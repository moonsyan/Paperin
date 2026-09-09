import { describe, expect, it } from 'vitest'
import { escapeXml, parseImageSize } from './docx'

describe('escapeXml', () => {
  it('转义五个保留字符', () => {
    expect(escapeXml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;',
    )
  })

  it('普通中文与英文原样保留', () => {
    expect(escapeXml('你好 world')).toBe('你好 world')
  })
})

describe('parseImageSize', () => {
  const pngWithSize = (width: number, height: number): Uint8Array => {
    const data = new Uint8Array(32)
    data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    const view = new DataView(data.buffer)
    view.setUint32(16, width)
    view.setUint32(20, height)
    return data
  }

  it('解析 PNG IHDR 宽高（大端）', () => {
    expect(parseImageSize(pngWithSize(640, 480))).toEqual({ width: 640, height: 480 })
    expect(parseImageSize(pngWithSize(1, 0xffffff))).toEqual({ width: 1, height: 0xffffff })
  })

  it('解析 JPEG SOF 宽高（大端）', () => {
    const data = new Uint8Array(32)
    data.set([0xff, 0xd8], 0)
    data.set([0xff, 0xe0], 2)
    const view = new DataView(data.buffer)
    view.setUint16(4, 16) // APP0 段长 16 → 下一 marker 起点为 2+2+16=20
    data.set([0xff, 0xc0], 20)
    view.setUint16(22, 17) // SOF 段长
    view.setUint16(25, 300) // 高
    view.setUint16(27, 400) // 宽
    expect(parseImageSize(data)).toEqual({ width: 400, height: 300 })
  })

  it('非图片/损坏数据返回 null', () => {
    expect(parseImageSize(new Uint8Array(32))).toBeNull()
    expect(parseImageSize(new Uint8Array([0x89, 0x50]))).toBeNull()
  })
})
