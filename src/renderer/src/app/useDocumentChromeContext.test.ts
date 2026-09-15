import { describe, expect, it } from 'vitest'
import { classifyActivePathKind } from './useDocumentChromeContext'

describe('classifyActivePathKind', () => {
  it('示例、未命名、库内与外部文件与当前路径条一致', () => {
    expect(classifyActivePathKind({ id: 'welcome', name: '欢迎使用.md' }, 'welcome', '/w', false)).toBe('demo')
    expect(classifyActivePathKind({ id: 'untitled-1', name: '未命名.md' }, 'untitled-1', '/w', false)).toBe('unnamed')
    expect(classifyActivePathKind({ id: 'a', name: 'a.md', path: '/w/a.md' }, 'a', '/w', false)).toBe('workspace')
    expect(classifyActivePathKind({ id: 'b', name: 'b.md', path: '/tmp/b.md' }, 'b', '/w', false)).toBe('external')
  })
})
