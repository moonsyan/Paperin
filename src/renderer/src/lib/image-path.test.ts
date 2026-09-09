import { describe, expect, it } from 'vitest'
import { toEditorImages, toMdimgUrl, toStoredImages } from './image-path'

describe('图片路径回写', () => {
  it('不含编辑器图片协议时保留原字符串引用', () => {
    const markdown = '普通文本\n![远程图片](https://example.com/image.png)'
    expect(toStoredImages(markdown, 'E:/notes')).toBe(markdown)
  })

  it('把当前文档目录下的编辑器图片路径还原为相对路径', () => {
    const markdown = '![封面](mdimg:///E:/notes/assets/cover.png)'
    expect(toStoredImages(markdown, 'E:/notes')).toBe('![封面](assets/cover.png)')
  })

  it('编码图片路径中的 URL 特殊字符并可正确回写', () => {
    const markdown = '![图片](assets/封面 #1?.png)'
    const editorMarkdown = toEditorImages(markdown, 'E:/notes')
    expect(editorMarkdown).toContain(toMdimgUrl('E:/notes/assets/封面 #1?.png'))
    expect(editorMarkdown).toContain('%23')
    expect(editorMarkdown).toContain('%3F')
    // 含空格的路径回写必须用尖括号目的地址（裸写在 CommonMark 里断链）
    expect(toStoredImages(editorMarkdown, 'E:/notes')).toBe('![图片](<assets/封面 #1?.png>)')
    // 尖括号形式再次进入编辑器仍可往返
    expect(toEditorImages(toStoredImages(editorMarkdown, 'E:/notes'), 'E:/notes')).toBe(editorMarkdown)
  })

  it('相对路径图片的 title 在编辑器往返中保留', () => {
    const markdown = '![封面](img/cover.png "封面标题")'
    const editorMarkdown = toEditorImages(markdown, 'E:/notes')
    // title 不编进 URL，保留在 mdimg 语法的尾部
    expect(editorMarkdown).toBe('![封面](mdimg:///E%3A/notes/img/cover.png "封面标题")')
    expect(toStoredImages(editorMarkdown, 'E:/notes')).toBe(markdown)
  })

  it('尖括号目的地址与 title 并存的往返', () => {
    const markdown = '![截图](<my photo.png> "截图说明")'
    const editorMarkdown = toEditorImages(markdown, 'E:/notes')
    expect(editorMarkdown).toBe('![截图](mdimg:///E%3A/notes/my%20photo.png "截图说明")')
    expect(toStoredImages(editorMarkdown, 'E:/notes')).toBe(markdown)
  })

  it('文件名含括号（Windows 重复下载命名）时往返不截断', () => {
    const markdown = '![截图](attachments/screenshot(1).png)'
    const editorMarkdown = toEditorImages(markdown, 'E:/notes')
    // encodeURIComponent 不编码括号，括号原样出现在 mdimg URL 中；
    // 关键是 src 必须完整（不被第一个 `)` 截断）且可 round-trip 还原
    expect(editorMarkdown).toContain('attachments/screenshot(1).png)')
    expect(toStoredImages(editorMarkdown, 'E:/notes')).toBe(markdown)
  })

  it('文件名含嵌套括号时保留原样不截断（正则保守回退）', () => {
    const markdown = '![a](assets/x(a(b)).png)'
    const editorMarkdown = toEditorImages(markdown, 'E:/notes')
    // 嵌套括号无法被配对正则匹配 → src 保持相对路径原文，绝不被截断
    expect(editorMarkdown).toBe(markdown)
  })

  it('目录外 Windows 绝对路径图片往返不产生多余的 /C:/ 前缀', () => {
    const url = toMdimgUrl('C:/pictures/截图 1.png')
    const stored = toStoredImages(`![外图](${url})`, 'E:/notes')
    expect(stored).toBe('![外图](C:/pictures/截图 1.png)')
    // 落盘的绝对路径再次进入编辑器、再存储，结果保持稳定
    expect(toStoredImages(`![外图](${toMdimgUrl('C:/pictures/截图 1.png')})`, 'E:/notes')).toBe(stored)
  })

  it('POSIX 绝对路径图片往返保留前导斜杠', () => {
    const url = toMdimgUrl('/home/user/pics/img.png')
    expect(url).toBe('mdimg:////home/user/pics/img.png')
    expect(toStoredImages(`![img](${url})`, '/home/user/notes')).toBe('![img](/home/user/pics/img.png)')
  })

  it('尖括号目的地址（路径含空格）正确解析且往返保留尖括号', () => {
    const markdown = '![截图](<my photo.png>)'
    const editorMarkdown = toEditorImages(markdown, 'E:/notes')
    // <> 不被编进路径（否则协议侧 extname 变成 .png> 永远 404）
    expect(editorMarkdown).toBe('![截图](mdimg:///E%3A/notes/my%20photo.png)')
    // 含空格的相对路径回写时恢复尖括号，裸写会在 CommonMark 里断链
    expect(toStoredImages(editorMarkdown, 'E:/notes')).toBe(markdown)
  })

  it('相对路径中的 .. 段先归一化再进 mdimg URL', () => {
    const editorMarkdown = toEditorImages('![x](../img/p.png)', 'D:/notes/docs')
    // new URL() 会折叠点段：不归一化会解析到 D:/img 而非 D:/notes/img
    expect(editorMarkdown).toBe('![x](mdimg:///D%3A/notes/img/p.png)')
    // 图片在文档目录之外：回写为可移植绝对路径
    expect(toStoredImages(editorMarkdown, 'D:/notes/docs')).toBe('![x](D:/notes/img/p.png)')
  })

  it('无 docDir 时 mdimg 协议不写入文件并还原为绝对路径', () => {
    const url = toMdimgUrl('C:/Users/me/pictures/photo.png')
    expect(toStoredImages(`![照片](${url})`, undefined)).toBe('![照片](C:/Users/me/pictures/photo.png)')
  })
})
