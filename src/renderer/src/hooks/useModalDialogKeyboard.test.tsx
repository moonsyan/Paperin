// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState, type RefObject } from 'react'
import { SKIP_LINK_TARGET_ID } from '../app/SkipLink'
import {
  focusSafeWorkspaceEntry,
  getDialogFocusableElements,
  restoreDialogFocus,
  useModalDialogKeyboard,
} from './useModalDialogKeyboard'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function TrapDialog(props: {
  open: boolean
  onClose: () => void
  closeOnEscape?: boolean
  triggerRef?: RefObject<HTMLButtonElement | null>
}): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useModalDialogKeyboard({
    open: props.open,
    onClose: props.onClose,
    dialogRef,
    initialFocusRef: inputRef,
    triggerRef: props.triggerRef,
    closeOnEscape: props.closeOnEscape,
  })
  if (!props.open) return <></>
  return (
    <div ref={dialogRef} role="dialog" aria-label="测试弹窗">
      <input ref={inputRef} aria-label="弹窗输入" />
      <button type="button">确定</button>
    </div>
  )
}

describe('getDialogFocusableElements', () => {
  it('收集未禁用的可聚焦控件', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<button>一</button><button disabled>禁</button><input /><a href="#">链</a><span tabindex="0">项</span>'
    const nodes = getDialogFocusableElements(root)
    expect(nodes).toHaveLength(4)
  })
})

describe('restoreDialogFocus', () => {
  it('触发器仍在 DOM 时优先聚焦触发器', () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    const ref = { current: trigger }
    restoreDialogFocus(document.body, ref)
    expect(document.activeElement).toBe(trigger)
  })

  it('触发器已卸载且先前焦点为 body 时落到安全工作区入口', () => {
    const host = document.createElement('div')
    host.id = SKIP_LINK_TARGET_ID
    host.tabIndex = -1
    document.body.append(host)
    restoreDialogFocus(document.body, { current: null })
    expect(document.activeElement).toBe(host)
  })

  it('触发器已卸载时落到安全工作区入口', () => {
    const host = document.createElement('div')
    host.id = SKIP_LINK_TARGET_ID
    host.tabIndex = -1
    document.body.append(host)
    const detached = document.createElement('button')
    restoreDialogFocus(detached, { current: detached })
    expect(document.activeElement).toBe(host)
  })
})

describe('focusSafeWorkspaceEntry', () => {
  it('聚焦正文宿主容器', () => {
    const host = document.createElement('main')
    host.id = SKIP_LINK_TARGET_ID
    host.tabIndex = -1
    document.body.append(host)
    focusSafeWorkspaceEntry()
    expect(document.activeElement).toBe(host)
  })
})

describe('useModalDialogKeyboard', () => {
  it('Escape 关闭并阻止冒泡', () => {
    const onClose = vi.fn()
    render(<TrapDialog open onClose={onClose} />)
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    expect(onClose).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('IME 组合态 Escape 不关闭', () => {
    const onClose = vi.fn()
    render(<TrapDialog open onClose={onClose} />)
    const input = screen.getByRole('textbox', { name: '弹窗输入' })
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true, keyCode: 229 })
    fireEvent.compositionEnd(input)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closeOnEscape 为 false 时不关闭', () => {
    const onClose = vi.fn()
    render(<TrapDialog open onClose={onClose} closeOnEscape={false} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape 关闭后焦点回到打开弹窗的触发按钮', () => {
    function Harness(): JSX.Element {
      const [open, setOpen] = useState(true)
      const triggerRef = useRef<HTMLButtonElement>(null)
      return (
        <>
          <button ref={triggerRef} type="button">
            打开弹窗
          </button>
          <TrapDialog open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} />
        </>
      )
    }
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: '打开弹窗' })
    trigger.focus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })

  it('Tab 在首尾控件间循环，不落到背景按钮', () => {
    render(
      <>
        <button type="button">背景动作</button>
        <TrapDialog open onClose={vi.fn()} />
      </>,
    )
    const background = screen.getByRole('button', { name: '背景动作' })
    const confirm = screen.getByRole('button', { name: '确定' })
    confirm.focus()
    fireEvent.keyDown(window, { key: 'Tab', bubbles: true })
    expect(document.activeElement).not.toBe(background)
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '弹窗输入' }))
  })
})
