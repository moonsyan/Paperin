import { describe, expect, it } from 'vitest'
import {
  dirnameWorkspacePath,
  isAbsoluteWorkspacePath,
  relativeWorkspacePath,
  resolveWorkspacePath,
} from './workspace-path'

describe('workspace-path（跨平台 Windows 风格路径）', () => {
  it('把 D:/notes + ./b.md 解析为工作区内绝对路径，不拼进 cwd', () => {
    expect(resolveWorkspacePath('D:/notes', './b.md').replace(/\\/g, '/')).toBe('D:/notes/b.md')
    expect(
      resolveWorkspacePath(dirnameWorkspacePath('D:/notes/a.md'), '../pic.png').replace(/\\/g, '/'),
    ).toBe('D:/pic.png')
    expect(dirnameWorkspacePath('D:/notes/a.md').replace(/\\/g, '/')).toBe('D:/notes')
  })

  it('relative / isAbsolute 对盘符路径保持 Windows 语义', () => {
    expect(relativeWorkspacePath('D:/notes', 'D:/notes/b.md').replace(/\\/g, '/')).toBe('b.md')
    expect(isAbsoluteWorkspacePath('D:/notes/a.md')).toBe(true)
    expect(isAbsoluteWorkspacePath('notes/a.md')).toBe(false)
  })
})
