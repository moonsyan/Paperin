// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SidebarQuickNav, SidebarFlatList, SidebarFooter } from './SidebarQuickNav'

afterEach(() => cleanup())

describe('SidebarQuickNav', () => {
  const baseProps = {
    view: null as null | 'recent' | 'favorites',
    onViewChange: vi.fn(),
    recentCount: 3,
    favoriteCount: 0,
    collectionName: '我的知识库',
    collectionActive: true,
  }

  it('搜索触发框点击后请求打开命令面板', () => {
    const onOpenSearch = vi.fn()
    render(<SidebarQuickNav {...baseProps} onOpenSearch={onOpenSearch} />)

    fireEvent.click(screen.getByLabelText('搜索文件与命令'))
    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it('快捷导航展示最近编辑与收藏计数，并切换视图', () => {
    const onViewChange = vi.fn()
    render(<SidebarQuickNav {...baseProps} onViewChange={onViewChange} />)

    expect(screen.getByText('最近编辑')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('我的收藏')).toBeTruthy()

    fireEvent.click(screen.getByText('最近编辑'))
    expect(onViewChange).toHaveBeenCalledWith('recent')
    fireEvent.click(screen.getByText('我的收藏'))
    expect(onViewChange).toHaveBeenCalledWith('favorites')
  })

  it('再次点击当前视图可回到文件集合', () => {
    const onViewChange = vi.fn()
    render(<SidebarQuickNav {...baseProps} view="recent" onViewChange={onViewChange} collectionActive={false} />)

    fireEvent.click(screen.getByText('最近编辑'))
    expect(onViewChange).toHaveBeenCalledWith(null)
    // 集合标题回退入口始终可用
    fireEvent.click(screen.getByText('我的知识库'))
    expect(onViewChange).toHaveBeenCalledWith(null)
  })

  it('有新建入口时呈现集合级新建按钮', () => {
    const onCreateFile = vi.fn()
    render(<SidebarQuickNav {...baseProps} onCreateFile={onCreateFile} />)

    fireEvent.click(screen.getByLabelText('新建文件'))
    expect(onCreateFile).toHaveBeenCalledTimes(1)
  })
})

describe('SidebarFlatList', () => {
  it('按条目渲染并标记当前文件', () => {
    const onOpen = vi.fn()
    render(
      <SidebarFlatList
        entries={[
          { key: 'a', name: 'a.md', path: 'D:/Notes/a.md' },
          { key: 'b', name: 'b.md', path: 'D:/Notes/b.md' },
        ]}
        activePath="D:/Notes/b.md"
        emptyLabel="最近编辑"
        onOpen={onOpen}
      />,
    )

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[1].className).toContain('active')

    fireEvent.click(rows[0])
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ path: 'D:/Notes/a.md' }))
  })

  it('空集合给出空状态文案', () => {
    render(<SidebarFlatList entries={[]} emptyLabel="我的收藏" onOpen={vi.fn()} />)
    expect(screen.getByText('我的收藏')).toBeTruthy()
  })
})

describe('SidebarFooter', () => {
  it('呈现集合摘要并触发设置入口', () => {
    const onOpenSettings = vi.fn()
    render(<SidebarFooter summary="32 个文档" onOpenSettings={onOpenSettings} />)

    expect(screen.getByText('32 个文档')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('打开设置'))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})

describe('SidebarQuickNav 搜索快捷键提示', () => {
  const baseProps = {
    view: null as null | 'recent' | 'favorites',
    onViewChange: vi.fn(),
    recentCount: 0,
    favoriteCount: 0,
    collectionName: '我的知识库',
    collectionActive: true,
  }

  it('展示由快捷键映射渲染的组合键（默认快速打开 Ctrl+P）', () => {
    render(<SidebarQuickNav {...baseProps} searchShortcutHint="Ctrl P" />)
    expect(screen.getByText('Ctrl P')).toBeTruthy()
  })

  it('未绑定（null）时隐藏 <kbd>，不展示残缺文案', () => {
    render(<SidebarQuickNav {...baseProps} />)
    expect(document.querySelector('.search-trigger kbd')).toBeNull()
  })
})
