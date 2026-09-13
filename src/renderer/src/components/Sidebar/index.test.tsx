import { useState } from 'react'
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from './index'

afterEach(cleanup)

const baseProps = {
  demoTree: [],
  demoFileNames: {},
  workspace: null,
  activeFileId: 'file-D:/draft/out.md',
  onSelectDemoFile: vi.fn(),
  onSelectWorkspaceFile: vi.fn(),
}

describe('Sidebar file-only view', () => {
  it('shows opened files outside the workspace in an external group', () => {
    render(<Sidebar {...baseProps} openFiles={[{ id: 'file-D:/draft/out.md', name: 'out.md', path: 'D:/draft/out.md' }]} />)
    expect(screen.getByRole('complementary', { name: '文件侧栏' })).toBeTruthy()
    expect(screen.getByRole('group', { name: '外部文件' })).toBeTruthy()
    expect(screen.getByRole('treeitem', { name: 'out.md' })).toBeTruthy()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('opens an external file through the same workspace selection callback', () => {
    const onSelectWorkspaceFile = vi.fn()
    render(<Sidebar {...baseProps} onSelectWorkspaceFile={onSelectWorkspaceFile} openFiles={[{ id: 'out', name: 'out.md', path: 'D:/draft/out.md' }]} />)
    fireEvent.click(screen.getByRole('treeitem', { name: 'out.md' }))
    expect(onSelectWorkspaceFile).toHaveBeenCalledWith('D:/draft/out.md', false)
  })

  it('exposes the file context menu as a keyboard-dismissible menu', () => {
    render(
      <Sidebar
        {...baseProps}
        workspace={{ path: 'D:/notes', name: 'notes', tree: [{ path: 'D:/notes/today.md', name: 'today.md' }] }}
        openFiles={[]}
      />,
    )
    fireEvent.click(screen.getByRole('treeitem', { name: 'notes' }))
    const row = screen.getByRole('treeitem', { name: 'today.md' })
    fireEvent.contextMenu(row, { clientX: 10, clientY: 10 })
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(row)
  })
})


describe('侧栏收藏完整交互', () => {
  function FavoritesSidebar(): JSX.Element {
    const [favorites, setFavorites] = useState<string[]>([])
    return <Sidebar {...baseProps}
      openFiles={[{ id: 'out', name: 'out.md', path: 'D:/draft/out.md' }]}
      recentFiles={[{ name: 'out.md', path: 'D:/draft/out.md' }]}
      favorites={favorites}
      onToggleFavorite={(path) => setFavorites(current => current.includes(path) ? current.filter(item => item !== path) : [...current, path])}
    />
  }

  it('外部文件星标可收藏，列表可打开和取消，计数立即同步', () => {
    baseProps.onSelectWorkspaceFile.mockClear()
    render(<FavoritesSidebar />)
    fireEvent.click(screen.getByRole('button', { name: '收藏 out.md' }))
    expect(baseProps.onSelectWorkspaceFile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '我的收藏 1' }))
    fireEvent.click(screen.getByText('out.md'))
    expect(baseProps.onSelectWorkspaceFile).toHaveBeenCalledWith('D:/draft/out.md', false)
    fireEvent.click(screen.getByRole('button', { name: '取消收藏 out.md' }))
    expect(screen.getByRole('button', { name: '我的收藏 0' })).toBeTruthy()
    expect(screen.queryByRole('listitem')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '我的收藏 0' }))
  })

  it('最近编辑中收藏与取消不会触发打开文件', () => {
    baseProps.onSelectWorkspaceFile.mockClear()
    render(<FavoritesSidebar />)
    fireEvent.click(screen.getByRole('button', { name: '最近编辑 1' }))
    fireEvent.click(screen.getByRole('button', { name: '收藏 out.md' }))
    expect(screen.getByRole('button', { name: '取消收藏 out.md' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '取消收藏 out.md' }))
    expect(baseProps.onSelectWorkspaceFile).not.toHaveBeenCalled()
  })
})
