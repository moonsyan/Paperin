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
