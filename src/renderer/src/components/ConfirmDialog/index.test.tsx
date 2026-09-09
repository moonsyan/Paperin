// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ConfirmDialog } from './index'
import type { ActiveConfirmRequest } from './index'

afterEach(() => { cleanup() })

function makeRequest(overrides: Partial<ActiveConfirmRequest> = {}): ActiveConfirmRequest {
  return {
    title: '未保存的更改',
    message: '关闭前是否保存？',
    buttons: [
      { id: 'save', label: '保存', kind: 'primary' },
      { id: 'discard', label: '放弃', kind: 'danger' },
      { id: 'cancel', label: '取消' },
    ],
    resolve: vi.fn(),
    sequence: 1,
    ...overrides,
  }
}

describe('ConfirmDialog', () => {
  it('request 为 null 时渲染 null', () => {
    const { container } = render(
      <ConfirmDialog request={null} onResolve={vi.fn()} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('有 request 时渲染标题、消息和按钮', () => {
    render(<ConfirmDialog request={makeRequest()} onResolve={vi.fn()} />)
    expect(screen.getByText('未保存的更改')).not.toBeNull()
    expect(screen.getByText('关闭前是否保存？')).not.toBeNull()
    expect(screen.getByRole('button', { name: '保存' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '放弃' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '取消' })).not.toBeNull()
  })

  it('dialog 标记为 alertdialog + aria-modal', () => {
    render(<ConfirmDialog request={makeRequest()} onResolve={vi.fn()} />)
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('未保存的更改')
  })

  it('点击按钮触发 onResolve(buttonId)', () => {
    const onResolve = vi.fn()
    render(<ConfirmDialog request={makeRequest()} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onResolve).toHaveBeenCalledWith('save')
  })

  it('点击遮罩层触发 cancel', () => {
    const onResolve = vi.fn()
    render(<ConfirmDialog request={makeRequest()} onResolve={onResolve} />)
    const overlay = document.querySelector('.dialog-overlay')!
    fireEvent.click(overlay)
    expect(onResolve).toHaveBeenCalledWith('cancel')
  })

  it('Esc 键触发 cancel', () => {
    const onResolve = vi.fn()
    render(<ConfirmDialog request={makeRequest()} onResolve={onResolve} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onResolve).toHaveBeenCalledWith('cancel')
  })

  it('点击 dialog 内部不冒泡到遮罩', () => {
    const onResolve = vi.fn()
    render(<ConfirmDialog request={makeRequest()} onResolve={onResolve} />)
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(dialog)
    expect(onResolve).not.toHaveBeenCalled()
  })

  it('defaultId 指定默认聚焦按钮', () => {
    render(
      <ConfirmDialog
        request={makeRequest({ defaultId: 'cancel' })}
        onResolve={vi.fn()}
      />,
    )
    const cancelBtn = screen.getByRole('button', { name: '取消' })
    expect(document.activeElement).toBe(cancelBtn)
  })

  it('danger 按钮有 danger 样式类', () => {
    render(<ConfirmDialog request={makeRequest()} onResolve={vi.fn()} />)
    const discardBtn = screen.getByRole('button', { name: '放弃' })
    expect(discardBtn.classList.contains('danger')).toBe(true)
  })

  it('primary 按钮有 primary 样式类', () => {
    render(<ConfirmDialog request={makeRequest()} onResolve={vi.fn()} />)
    const saveBtn = screen.getByRole('button', { name: '保存' })
    expect(saveBtn.classList.contains('primary')).toBe(true)
  })

  it('request 序列变化时重新挂载（key 切换）', () => {
    const onResolve = vi.fn()
    const { rerender } = render(
      <ConfirmDialog request={makeRequest({ sequence: 1 })} onResolve={onResolve} />,
    )
    expect(screen.getByText('未保存的更改')).not.toBeNull()
    rerender(
      <ConfirmDialog
        request={makeRequest({ sequence: 2, title: '新标题' })}
        onResolve={onResolve}
      />,
    )
    expect(screen.getByText('新标题')).not.toBeNull()
  })
})
