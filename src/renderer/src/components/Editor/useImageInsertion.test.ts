// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { getImagePasteText, getInsertableImageFiles } from './useImageInsertion'

const createClipboard = (html: string, text: string) => ({
  getData: (type: string) => {
    if (type === 'text/html') return html
    if (type === 'text/plain') return text
    return ''
  },
})

describe('getImagePasteText', () => {
  it('图片粘贴没有 HTML 时保留纯文本及换行', () => {
    const clipboard = createClipboard('', '图片说明\n第二行')

    expect(getImagePasteText(clipboard)).toBe('图片说明\n第二行')
  })

  it('网页 HTML 转换为 Markdown 并保留格式', () => {
    const clipboard = createClipboard('<p>图片说明 <strong>加粗</strong></p>', '备用文本')

    expect(getImagePasteText(clipboard)).toBe('图片说明 **加粗**')
  })

  it('纯文本为空时从 HTML 保留段落和换行', () => {
    const clipboard = createClipboard('<p>第一段</p><p>第二段<br>第三行</p>', '')

    expect(getImagePasteText(clipboard)).toBe('第一段\n\n第二段\n第三行')
  })

  it('纯图片且没有文字时不插入空文本', () => {
    const clipboard = createClipboard('<img src="image.png">', '')

    expect(getImagePasteText(clipboard)).toBe('')
  })

  it('混合大小图片时只保留允许插入的文件', () => {
    const small = { size: 1024 }
    const large = { size: 21 * 1024 * 1024 }

    expect(getInsertableImageFiles([small, large])).toEqual([small])
  })
})
