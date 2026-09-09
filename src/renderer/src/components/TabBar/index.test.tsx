// @vitest-environment jsdom
import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TabBar } from './index'
import type { OpenFile } from '../Sidebar'

const file = (id: string, name: string, extra: Partial<OpenFile> = {}): OpenFile => ({
  id,
  name,
  ...extra,
})

// jsdom 未实现 scrollIntoView（TabBar 切换/拖拽后滚入可视区会调用）
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// vitest globals 未启用时 RTL 不自动清理，手动卸载避免跨用例 DOM 残留
afterEach(() => {
  cleanup()
})

const baseProps = {
  activeFileId: 'a',
  savedMap: {},
  onSwitch: vi.fn(),
  onClose: vi.fn(),
  onCloseOthers: vi.fn(),
  onCloseAll: vi.fn(),
  onTogglePin: vi.fn(),
  onReorder: vi.fn(),
  graphTabOpen: false,
  graphTabActive: false,
  onGraphTabSwitch: vi.fn(),
  onGraphTabClose: vi.fn(),
}

describe('TabBar', () => {
  it('无标签且图谱未打开时不渲染', () => {
    const { container } = render(<TabBar {...baseProps} openFiles={[]} />)
    expect(container.querySelector('.tabbar')).toBeNull()
  })

  it('渲染标签与激活态、脏标记、固定图标', () => {
    render(
      <TabBar
        {...baseProps}
        openFiles={[file('a', 'A.md', { pinned: true }), file('b', 'B.md')]}
        savedMap={{ b: false }}
      />,
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')
    expect(tabs[0].getAttribute('aria-label')).toContain('已固定')
    expect(tabs[1].querySelector('.tab-dot')).not.toBeNull()
    expect(tabs[1].getAttribute('aria-label')).toContain('未保存')
  })

  it('点击切换、关闭按钮冒泡被阻止', async () => {
    const onSwitch = vi.fn()
    const onClose = vi.fn()
    render(
      <TabBar
        {...baseProps}
        openFiles={[file('a', 'A.md'), file('b', 'B.md')]}
        onSwitch={onSwitch}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByTitle('B.md'))
    expect(onSwitch).toHaveBeenCalledWith('b')
    fireEvent.click(screen.getByLabelText('关闭 B.md'))
    expect(onClose).toHaveBeenCalledWith('b')
    expect(onSwitch).toHaveBeenCalledTimes(1)
  })

  it('右键打开菜单并执行关闭其他；全部固定时禁用', () => {
    const onCloseOthers = vi.fn()
    render(
      <TabBar
        {...baseProps}
        openFiles={[file('a', 'A.md'), file('b', 'B.md')]}
        onCloseOthers={onCloseOthers}
      />,
    )
    fireEvent.contextMenu(screen.getByTitle('A.md'))
    const menu = screen.getByRole('menu')
    expect(menu).not.toBeNull()
    fireEvent.click(screen.getByText('关闭其他标签页'))
    expect(onCloseOthers).toHaveBeenCalledWith('a')
  })

  it('键盘 Enter 切换标签', () => {
    const onSwitch = vi.fn()
    render(
      <TabBar
        {...baseProps}
        openFiles={[file('a', 'A.md'), file('b', 'B.md')]}
        onSwitch={onSwitch}
      />,
    )
    fireEvent.keyDown(screen.getByTitle('B.md'), { key: 'Enter' })
    expect(onSwitch).toHaveBeenCalledWith('b')
  })

  it('知识图谱标签固定末尾且激活时文件标签失去激活态', () => {
    const onGraphTabClose = vi.fn()
    render(
      <TabBar
        {...baseProps}
        openFiles={[file('a', 'A.md')]}
        graphTabOpen
        graphTabActive
        onGraphTabClose={onGraphTabClose}
      />,
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].getAttribute('aria-selected')).toBe('false')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByLabelText('关闭知识图谱标签'))
    expect(onGraphTabClose).toHaveBeenCalled()
  })
})
