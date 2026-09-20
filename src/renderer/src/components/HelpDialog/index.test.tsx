// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HelpDialog } from './index'
import { DEFAULT_SHORTCUTS } from '../../data/shortcuts'

describe('HelpDialog', () => {
  it('打开后成为对话框并接过焦点，Escape 不会落到编辑器', () => {
    const onClose = vi.fn()
    render(
      <>
        <textarea defaultValue="正文" aria-label="编辑器" />
        <HelpDialog view="shortcuts" onClose={onClose} shortcuts={DEFAULT_SHORTCUTS} />
      </>,
    )

    const dialog = screen.getByRole('dialog', { name: '快捷键一览' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }))
    expect(screen.getByText('快速打开（文件跳转）')).toBeTruthy()

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    const prevented = !window.dispatchEvent(event)
    expect(onClose).toHaveBeenCalledOnce()
    expect(prevented || event.defaultPrevented).toBe(true)
  })
})
