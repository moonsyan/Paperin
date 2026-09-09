import { describe, expect, it } from 'vitest'
import { sameDesktopFilePath } from './desktop-file-path'

describe('桌面文件路径', () => {
  it('Windows 上忽略路径大小写并保留中文路径', () => {
    expect(
      sameDesktopFilePath('D:\\文档\\A.md', 'd:\\文档\\a.MD', true),
    ).toBe(true)
  })

  it('大小写敏感平台不合并不同大小写的路径', () => {
    expect(sameDesktopFilePath('/tmp/A.md', '/tmp/a.md', false)).toBe(false)
  })

  it('仅有一侧路径时不视为同一文件', () => {
    expect(sameDesktopFilePath('/tmp/a.md', undefined, false)).toBe(false)
  })
})
