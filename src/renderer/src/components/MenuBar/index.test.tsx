// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MenuBar } from './index'
import { DEFAULT_SHORTCUTS } from '../../data/shortcuts'

// vitest globals 未启用时 RTL 不自动清理，手动卸载避免跨用例 DOM 残留
afterEach(() => {
  cleanup()
})

const baseProps = {
  onAction: vi.fn(),
  shortcuts: { ...DEFAULT_SHORTCUTS },
}

/** 打开指定菜单（默认点击路径）并返回触发按钮 */
function openFileMenu(byKeyboard: 'down' | 'up' | null = null) {
  const buttons = screen.getAllByRole('button')
  const fileButton = buttons.find((b) => b.textContent === '文件')
  if (!fileButton) throw new Error('未找到「文件」菜单按钮')
  if (byKeyboard === 'down') fireEvent.keyDown(fileButton, { key: 'ArrowDown' })
  else if (byKeyboard === 'up') fireEvent.keyDown(fileButton, { key: 'ArrowUp' })
  else fireEvent.click(fileButton)
  return fileButton
}

describe('MenuBar', () => {
  it('渲染五个菜单标题，默认无下拉展开', () => {
    const { container } = render(<MenuBar {...baseProps} />)
    for (const label of ['文件', '编辑', '段落', '视图', '帮助']) {
      expect(screen.getByText(label)).not.toBeNull()
    }
    expect(screen.queryByRole('menu')).toBeNull()
    expect(container.querySelectorAll('.menu-entry')).toHaveLength(5)
  })

  it('点击标题打开下拉；再点击关闭（点击打开的菜单再点=关闭）', () => {
    render(<MenuBar {...baseProps} />)
    const fileButton = openFileMenu()
    expect(fileButton.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('menu')).not.toBeNull()
    expect(screen.getByText('打开文件')).not.toBeNull()

    fireEvent.click(fileButton)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(fileButton.getAttribute('aria-expanded')).toBe('false')
  })

  it('悬停打开的菜单点击=钉住（保持打开）；Enter 再按=关闭', () => {
    render(<MenuBar {...baseProps} />)
    const entry = screen.getByText('文件').closest('.menu-entry')
    if (!(entry instanceof HTMLElement)) throw new Error('未找到菜单容器')
    // 悬停路径：byClick=false
    fireEvent.mouseEnter(entry)

    const fileButton = entry.querySelector('button')
    if (!fileButton) throw new Error('未找到触发按钮')
    // D2：悬停打开后点击标题=钉住而非关闭
    fireEvent.click(fileButton)
    expect(screen.queryByRole('menu')).not.toBeNull()

    // 悬停打开的菜单 Enter=钉住（第一次），再按才关闭
    fireEvent.keyDown(fileButton, { key: 'Enter' })
    expect(screen.queryByRole('menu')).not.toBeNull()
    fireEvent.keyDown(fileButton, { key: 'Enter' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('悬停其他菜单标题时切换下拉内容', () => {
    render(<MenuBar {...baseProps} />)
    openFileMenu()
    expect(screen.getByText('保存')).not.toBeNull()

    const editEntry = screen.getByText('编辑').closest('.menu-entry')
    if (!(editEntry instanceof HTMLElement)) throw new Error('未找到编辑菜单容器')
    fireEvent.mouseEnter(editEntry)
    expect(screen.queryByText('保存')).toBeNull()
    expect(screen.getByText('粗体')).not.toBeNull()
  })

  it('点击菜单项分发动作、关闭下拉并把焦点还给触发按钮', () => {
    const onAction = vi.fn()
    render(<MenuBar {...baseProps} onAction={onAction} />)
    const fileButton = openFileMenu()

    fireEvent.click(screen.getByText('保存'))
    expect(onAction).toHaveBeenCalledWith('save')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(fileButton)
  })

  it('最近文件注入到「打开文件夹」之后并以 openRecent:<path> 分发', () => {
    const onAction = vi.fn()
    render(
      <MenuBar
        {...baseProps}
        onAction={onAction}
        recentFiles={[
          { path: 'D:/笔记/中文.md', name: '中文.md' },
          { path: 'D:/notes/b.md', name: 'b.md' },
        ]}
      />,
    )
    openFileMenu()

    const items = Array.from(screen.getAllByRole('menuitem'))
    const labels = items.map((el) => el.textContent)
    const folderIdx = labels.findIndex((t) => t?.includes('打开文件夹'))
    expect(labels[folderIdx + 1]).toContain('中文.md')
    expect(labels[folderIdx + 2]).toContain('b.md')

    fireEvent.click(screen.getByText('中文.md'))
    expect(onAction).toHaveBeenCalledWith('openRecent:D:/笔记/中文.md')
  })

  it('无最近文件时不注入空分组', () => {
    render(<MenuBar {...baseProps} />)
    openFileMenu()
    const labels = screen.getAllByRole('menuitem').map((el) => el.textContent)
    const folderIdx = labels.findIndex((t) => t?.includes('打开文件夹'))
    expect(labels[folderIdx + 1]?.includes('快速打开')).toBe(true)
  })

  it('快捷键标签按当前映射渲染：自定义值生效、空串不显示', () => {
    render(
      <MenuBar
        {...baseProps}
        shortcuts={{ ...DEFAULT_SHORTCUTS, save: 'Ctrl+Alt+S', open: '' }}
      />,
    )
    openFileMenu()

    const saveItem = screen.getAllByRole('menuitem').find(
      (el) => el.textContent?.includes('保存'),
    )
    expect(saveItem?.querySelector('.sc')?.textContent).toBe('Ctrl+Alt+S')

    const openItem = screen.getAllByRole('menuitem').find(
      (el) => el.textContent?.includes('打开文件'),
    )
    expect(openItem?.querySelector('.sc')).toBeNull()
  })

  it('不在映射内的固定键位（插入链接等内置 keymap）保留静态默认值', () => {
    render(<MenuBar {...baseProps} />)
    openFileMenu()
    const paletteItem = screen.getAllByRole('menuitem').find(
      (el) => el.textContent?.includes('图片管理'),
    )
    expect(paletteItem).not.toBeNull()

    const editButton = screen.getByText('编辑').closest('.menu-entry')
    if (!(editButton instanceof HTMLElement)) throw new Error('未找到编辑菜单容器')
    fireEvent.mouseEnter(editButton)
    // insertLink 不在 ShortcutMap 中：保留静态 Ctrl+K 兜底
    const linkItem = screen.getAllByRole('menuitem').find(
      (el) => el.textContent?.includes('插入链接'),
    )
    expect(linkItem?.querySelector('.sc')?.textContent).toBe('Ctrl+K')
  })

  it('ArrowDown 键盘打开并聚焦首项；ArrowUp 聚焦末项', () => {
    render(<MenuBar {...baseProps} />)
    openFileMenu('down')
    const items = screen.getAllByRole('menuitem')
    expect(document.activeElement).toBe(items[0])

    // 关闭后用 ArrowUp 打开：聚焦末项（重开后的下拉是新的 DOM 节点，需重新查询）
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    const fileButton = openFileMenu('up')
    expect(screen.queryByRole('menu')).not.toBeNull()
    const reopened = screen.getAllByRole('menuitem')
    expect(document.activeElement).toBe(reopened[reopened.length - 1])
    expect(fileButton.getAttribute('aria-expanded')).toBe('true')
  })

  it('下拉内方向键循环导航，Home/End 跳转首尾', () => {
    render(<MenuBar {...baseProps} />)
    openFileMenu('down')
    const items = screen.getAllByRole('menuitem')

    fireEvent.keyDown(items[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1], { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0], { key: 'End' })
    expect(document.activeElement).toBe(items[items.length - 1])
    // 从末项继续 ArrowDown 回绕到首项
    fireEvent.keyDown(items[items.length - 1], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])
    // 首项 ArrowUp 回绕到末项
    fireEvent.keyDown(items[0], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[items.length - 1])
  })

  it('下拉内 Esc 关闭并把焦点还给触发按钮', () => {
    render(<MenuBar {...baseProps} />)
    const fileButton = openFileMenu('down')

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(fileButton)
  })

  it('下拉内 Tab 离开时关闭菜单（WAI-ARIA menu 模式）', () => {
    render(<MenuBar {...baseProps} />)
    openFileMenu('down')

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('分隔线不渲染为可聚焦项', () => {
    render(<MenuBar {...baseProps} />)
    openFileMenu()
    expect(screen.queryAllByRole('separator')).toHaveLength(0)
    // 文件菜单含多条分隔线，但均不可聚焦
    const focusable = screen
      .getAllByRole('menuitem')
      .every((el) => el.tagName === 'BUTTON')
    expect(focusable).toBe(true)
  })

  it('mousedown 在菜单栏外部时关闭已打开的菜单', () => {
    render(
      <div>
        <div data-testid="outside" />
        <MenuBar {...baseProps} />
      </div>,
    )
    openFileMenu()
    expect(screen.queryByRole('menu')).not.toBeNull()

    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
