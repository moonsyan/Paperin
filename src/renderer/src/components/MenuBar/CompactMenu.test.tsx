// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { CompactMenu } from './CompactMenu'

afterEach(cleanup)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

describe('分层更多操作', () => {
  it('首页只展示快捷操作和分类；悬停不弹出，重新打开回到首页', () => {
    render(<CompactMenu onAction={vi.fn()} shortcuts={{}} />)
    fireEvent.mouseEnter(screen.getByRole('button', { name: '更多菜单' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    click('更多菜单')
    const panel = screen.getByRole('dialog', { name: '更多操作' })
    expect(within(panel).getAllByRole('button')).toHaveLength(11)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByText('导出 PDF')).toBeNull()
    click('导出与发布')
    expect(screen.getByText('导出 PDF')).toBeTruthy()
    click('更多菜单')
    click('更多菜单')
    expect(screen.queryByText('导出 PDF')).toBeNull()
  })

  it('可逐层返回并恢复焦点；首页 Escape 关闭，输入法组合态不退出', () => {
    render(<CompactMenu onAction={vi.fn()} shortcuts={{}} />)
    click('更多菜单')
    click('排版与插入')
    click('表格操作')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape', isComposing: true })
    expect(screen.getByText('删除选中单元格')).toBeTruthy()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('表格操作')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('排版与插入')
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('更多菜单')
  })

  it('搜索覆盖深层操作并沿用禁用条件、快捷键和原命令分发', () => {
    const onAction = vi.fn()
    render(<CompactMenu onAction={onAction} shortcuts={{ save: 'Alt+S' }} isActionEnabled={(id) => id !== 'save'} />)
    click('更多菜单')
    const save = screen.getByRole('button', { name: '保存' })
    expect(save.hasAttribute('disabled')).toBe(true)
    expect(within(save).getByText('Alt+S')).toBeTruthy()
    fireEvent.click(save)
    expect(onAction).not.toHaveBeenCalled()
    click('搜索全部操作')
    const search = screen.getByRole('searchbox', { name: '搜索菜单命令' })
    expect(document.activeElement).toBe(search)
    fireEvent.change(search, { target: { value: '表格加列' } })
    click('表格加列（右侧）')
    expect(onAction).toHaveBeenCalledWith('tableCol')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('更多菜单')
  })

  it('设置仍打开原设置窗口，Tab 可离开浮层，点击外部关闭', () => {
    const onAction = vi.fn()
    render(<><CompactMenu onAction={onAction} shortcuts={{}} /><button>正文之外</button></>)
    click('更多菜单')
    click('偏好设置…')
    expect(onAction).toHaveBeenCalledWith('settings')
    click('更多菜单')
    act(() => screen.getByText('正文之外').focus())
    expect(screen.queryByRole('dialog')).toBeNull()
    click('更多菜单')
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
