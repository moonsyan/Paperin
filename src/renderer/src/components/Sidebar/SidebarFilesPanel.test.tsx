// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SidebarFilesPanel } from './SidebarFilesPanel'

afterEach(cleanup)
it('标签筛选空态保留清除入口与外部文件星标', () => {
  const onClear = vi.fn(), onToggle = vi.fn()
  render(<SidebarFilesPanel panel={{ id: 'files', title: '文件', slot: 'sidebar.primary', order: 0 }}
    context={{ activeFileId: 'none', hasWorkspace: true }} nodes={[]}
    externalNodes={[{ key: 'external', name: '随记.md', kind: 'file', path: '/draft/随记.md' }]}
    tagFilter={{ tag: '工作', paths: [] }} onClearTagFilter={onClear}
    treeProps={{ interactive: true, activeFileId: 'none', collapsedKeys: new Set(), onToggleCollapse: vi.fn(),
      onOpenFile: vi.fn(), onContextMenu: vi.fn(), renamingKey: null, renameValue: '', onRenameValueChange: vi.fn(),
      onRenameCommit: vi.fn(), onRenameCancel: vi.fn(), onToggleFavorite: onToggle }} />)
  expect(screen.getByText('没有包含该标签的文件')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '清除标签筛选' }))
  expect(onClear).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '收藏 随记.md' }))
  expect(onToggle).toHaveBeenCalledWith('/draft/随记.md')
})
