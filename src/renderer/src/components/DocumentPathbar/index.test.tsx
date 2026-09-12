// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DocumentPathbar } from './index'

afterEach(() => {
  cleanup()
})

describe('DocumentPathbar', () => {
  it('库内文件：显示相对目录段与文件名，目录段点击触发定位', () => {
    const onReveal = vi.fn()
    render(
      <DocumentPathbar
        title="note.md"
        kind="workspace"
        path="D:/notes/learn/method/note.md"
        workspacePath="D:/notes"
        onRevealInSidebar={onReveal}
      />,
    )
    expect(screen.getByText('learn')).toBeTruthy()
    expect(screen.getByText('method')).toBeTruthy()
    expect(document.querySelector('.pathbar-file')?.textContent).toBe('note.md')
    expect(screen.queryByText('外部文件')).toBeNull()

    fireEvent.click(screen.getByText('method'))
    expect(onReveal).toHaveBeenCalledTimes(1)
  })

  it('库内根级文件：无目录段，只显示文件名与定位按钮', () => {
    render(
      <DocumentPathbar
        title="root.md"
        kind="workspace"
        path="D:/notes/root.md"
        workspacePath="D:/notes"
        onRevealInSidebar={() => {}}
      />,
    )
    expect(document.querySelector('.pathbar-file')?.textContent).toBe('root.md')
    expect(screen.queryByRole('button', { name: /定位目录/ })).toBeNull()
    expect(screen.getByRole('button', { name: '在侧栏中定位 root.md' })).toBeTruthy()
  })

  it('外部文件：显示外部文件标记与完整路径，不渲染按钮', () => {
    render(
      <DocumentPathbar
        title="temp.md"
        kind="external"
        path="D:/downloads/temp.md"
        workspacePath="D:/notes"
      />,
    )
    expect(screen.getByText('外部文件')).toBeTruthy()
    expect(screen.getByText('D:/downloads/temp.md')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('未命名文档：显示尚未保存到磁盘提示', () => {
    render(<DocumentPathbar title="未命名 1.md" kind="unnamed" />)
    expect(screen.getByText('未命名 · 尚未保存到磁盘')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('示例文档：显示另存为提示', () => {
    render(<DocumentPathbar title="欢迎" kind="demo" />)
    expect(screen.getByText('示例文档 · 另存为后保留修改')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('未传定位回调时不渲染定位按钮（只读展示）', () => {
    render(
      <DocumentPathbar
        title="note.md"
        kind="workspace"
        path="D:/notes/a/note.md"
        workspacePath="D:/notes"
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })
})
