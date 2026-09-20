// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SKIP_LINK_TARGET_ID } from '../../app/SkipLink'
import { WorkspaceSearchDialog } from './index'

afterEach(() => cleanup())

beforeEach(() => {
  window.desktopAPI = {
    workspace: { search: vi.fn() },
  } as unknown as Window['desktopAPI']
})

const baseProps = {
  open: true,
  workspacePath: '/tmp/ws',
  workspaceName: '演示库',
  onClose: vi.fn(),
  onSelect: vi.fn(),
}

describe('WorkspaceSearchDialog 键盘与可访问性（R08）', () => {
  it('按 role 与标题名称定位对话框，并具备 aria-modal', () => {
    render(<WorkspaceSearchDialog {...baseProps} />)
    const dialog = screen.getByRole('dialog', { name: /在工作区中搜索/ })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('Tab 不能聚焦到背景动作', () => {
    render(
      <>
        <button type="button">背景保存</button>
        <WorkspaceSearchDialog {...baseProps} />
      </>,
    )
    const searchBtn = screen.getByRole('button', { name: '搜索' })
    searchBtn.focus()
    fireEvent.keyDown(window, { key: 'Tab', bubbles: true })
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '背景保存' }))
  })

  it('compositionstart → Escape → compositionend 不误关', () => {
    const onClose = vi.fn()
    render(<WorkspaceSearchDialog {...baseProps} onClose={onClose} />)
    const input = screen.getByPlaceholderText(/输入关键词/)
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true, keyCode: 229 })
    fireEvent.compositionEnd(input)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('关闭后触发器已卸载时焦点落到正文宿主', () => {
    const host = document.createElement('div')
    host.id = SKIP_LINK_TARGET_ID
    host.tabIndex = -1
    document.body.append(host)

    function Harness(): JSX.Element {
      const [open, setOpen] = useState(true)
      const [showTrigger, setShowTrigger] = useState(true)
      const handleClose = (): void => {
        setOpen(false)
        setShowTrigger(false)
      }
      return (
        <>
          {showTrigger ? <button type="button">打开搜索</button> : null}
          <WorkspaceSearchDialog {...baseProps} open={open} onClose={handleClose} />
        </>
      )
    }
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).toBe(host)
  })
})
