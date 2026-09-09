import { describe, expect, it } from 'vitest'
import {
  extractMarkdownPaths,
  type MarkdownDropDataTransfer,
} from './drop-markdown'

// 构造最小化的 DataTransfer 替身（真实 DOM 的 DataTransfer 在测试环境不可用）
function makeDataTransfer(
  types: string[],
  files: { name: string; path: string }[],
): MarkdownDropDataTransfer {
  return { types, files }
}

describe('extractMarkdownPaths（拖拽打开 Markdown）', () => {
  it('拖拽类型不含 Files 时返回空数组', () => {
    const dt = makeDataTransfer(['text/plain', 'application/x-internal'], [])
    expect(extractMarkdownPaths(dt)).toEqual([])
  })

  it('混合文件时仅保留 .md / .markdown（大小写不敏感），排除其它类型', () => {
    const dt = makeDataTransfer(
      ['Files'],
      [
        { name: 'note.md', path: '/a/note.md' },
        { name: 'README.MD', path: '/a/README.MD' },
        { name: 'doc.markdown', path: '/a/doc.markdown' },
        { name: 'guide.MARKDOWN', path: '/a/guide.MARKDOWN' },
        { name: 'pic.png', path: '/a/pic.png' },
        { name: 'memo.txt', path: '/a/memo.txt' },
      ],
    )
    expect(extractMarkdownPaths(dt)).toEqual([
      '/a/note.md',
      '/a/README.MD',
      '/a/doc.markdown',
      '/a/guide.MARKDOWN',
    ])
  })

  it('files 列表为空时返回空数组', () => {
    const dt = makeDataTransfer(['Files'], [])
    expect(extractMarkdownPaths(dt)).toEqual([])
  })

  it('path 为空时跳过该文件', () => {
    const dt = makeDataTransfer(
      ['Files'],
      [
        { name: 'ok.md', path: '/a/ok.md' },
        { name: 'bad.md', path: '' },
      ],
    )
    expect(extractMarkdownPaths(dt)).toEqual(['/a/ok.md'])
  })

  it('非 Files 拖拽即使在 files 有内容也返回空', () => {
    const dt = makeDataTransfer(
      ['application/x-tab'],
      [{ name: 'x.md', path: '/a/x.md' }],
    )
    expect(extractMarkdownPaths(dt)).toEqual([])
  })
})
