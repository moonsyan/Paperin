// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SKIP_LINK_TARGET_ID } from '../../app/SkipLink'
import { PublishDialog } from './index'

afterEach(() => cleanup())

describe('PublishDialog 键盘与可访问性（R08）', () => {
  it('按 role 与标题名称定位对话框，打开后焦点在关闭按钮', () => {
    render(
      <PublishDialog open onClose={vi.fn()} onExportBundle={vi.fn()} onCopyRichText={vi.fn()} />,
    )
    const dialog = screen.getByRole('dialog', { name: '发布' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭' }))
  })

  it('Tab 不能聚焦到背景动作', () => {
    render(
      <>
        <button type="button">背景导出</button>
        <PublishDialog open onClose={vi.fn()} onExportBundle={vi.fn()} onCopyRichText={vi.fn()} />
      </>,
    )
    const lastAction = screen.getByRole('button', { name: /复制当前文档富文本/ })
    lastAction.focus()
    fireEvent.keyDown(window, { key: 'Tab', bubbles: true })
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '背景导出' }))
  })

  it('导出 busy 时 Escape 不关闭', () => {
    const onClose = vi.fn()
    render(
      <PublishDialog
        open
        busy
        onClose={onClose}
        onExportBundle={vi.fn()}
        onCopyRichText={vi.fn()}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('compositionstart → Escape → compositionend 不误关', () => {
    const onClose = vi.fn()
    render(
      <PublishDialog
        open
        hasWorkspace
        availableTags={['note']}
        onClose={onClose}
        onExportBundle={vi.fn()}
        onCopyRichText={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '按标签' }))
    const tagInput = screen.getByPlaceholderText('输入标签')
    fireEvent.compositionStart(tagInput)
    fireEvent.keyDown(tagInput, { key: 'Escape', isComposing: true, keyCode: 229 })
    fireEvent.compositionEnd(tagInput)
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
          {showTrigger ? <button type="button">打开发布</button> : null}
          <PublishDialog
            open={open}
            onClose={handleClose}
            onExportBundle={vi.fn()}
            onCopyRichText={vi.fn()}
          />
        </>
      )
    }
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).toBe(host)
  })
})

describe('PublishDialog（R04 范围与动作一致）', () => {
  it('按标签但未输入标签时禁用资源包导出，并给出可访问原因', () => {
    const onExportBundle = vi.fn()
    render(
      <PublishDialog
        open
        onClose={vi.fn()}
        onExportBundle={onExportBundle}
        onCopyRichText={vi.fn()}
        hasWorkspace
        availableTags={['note']}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '按标签' }))
    fireEvent.change(screen.getByPlaceholderText('输入标签'), { target: { value: '   ' } })
    const exportBtn = screen.getByRole('button', { name: /导出 HTML 资源包/ })
    expect(exportBtn).toHaveProperty('disabled', true)
    expect(exportBtn.getAttribute('aria-describedby')).toBe('publish-tag-required')
    expect(document.getElementById('publish-tag-required')?.textContent).toMatch(/标签/)
    fireEvent.click(exportBtn)
    expect(onExportBundle).not.toHaveBeenCalled()
  })

  it('集合模式下不能触发「复制当前文档富文本」', () => {
    const onCopyRichText = vi.fn()
    render(
      <PublishDialog
        open
        onClose={vi.fn()}
        onExportBundle={vi.fn()}
        onCopyRichText={onCopyRichText}
        hasWorkspace
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '当前目录' }))
    const copyBtn = screen.getByRole('button', { name: /复制当前文档富文本/ })
    expect(copyBtn).toHaveProperty('disabled', true)
    expect(copyBtn.getAttribute('title') ?? copyBtn.getAttribute('aria-describedby')).toBeTruthy()
    fireEvent.click(copyBtn)
    expect(onCopyRichText).not.toHaveBeenCalled()
  })

  it('按标签且输入为空时不会以 kind:document 回调导出', () => {
    const onExportBundle = vi.fn()
    render(
      <PublishDialog
        open
        onClose={vi.fn()}
        onExportBundle={onExportBundle}
        onCopyRichText={vi.fn()}
        hasWorkspace
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: '按标签' }))
    const exportBtn = screen.getByRole('button', { name: /导出 HTML 资源包/ })
    expect(exportBtn).toHaveProperty('disabled', true)
    fireEvent.click(exportBtn)
    expect(onExportBundle).not.toHaveBeenCalled()
    onExportBundle.mockClear()
    fireEvent.change(screen.getByPlaceholderText('输入标签'), { target: { value: 'note' } })
    fireEvent.click(exportBtn)
    expect(onExportBundle).toHaveBeenCalledOnce()
    const scope = onExportBundle.mock.calls[0]?.[1]
    expect(scope).toEqual({ kind: 'tag', tag: 'note' })
    expect(scope?.kind).not.toBe('document')
  })

  it('可保存、应用和删除发布配置，空名称不保存', () => {
    const onSaveProfile = vi.fn()
    const onDeleteProfile = vi.fn()
    const profiles = [
      {
        id: 'p-tech',
        name: '技术文档',
        options: { template: 'technical' as const, includeToc: false, inlineImages: false, cleanWikiLinks: true },
        scope: { kind: 'document' as const },
      },
    ]
    render(
      <PublishDialog
        open
        onClose={vi.fn()}
        onExportBundle={vi.fn()}
        onCopyRichText={vi.fn()}
        profiles={profiles}
        onSaveProfile={onSaveProfile}
        onDeleteProfile={onDeleteProfile}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '保存当前配置' }))
    expect(onSaveProfile).not.toHaveBeenCalled()
    fireEvent.change(screen.getByPlaceholderText('配置名称'), { target: { value: '博客发布' } })
    fireEvent.click(screen.getByRole('button', { name: '保存当前配置' }))
    expect(onSaveProfile).toHaveBeenCalledWith(
      '博客发布',
      expect.objectContaining({ template: 'blog' }),
      { kind: 'document' },
    )
    fireEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(screen.getByRole('radio', { name: '技术文档' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onDeleteProfile).toHaveBeenCalledWith('p-tech')
  })

  it('非 busy 时点击遮罩取消，不触发导出', () => {
    const onClose = vi.fn()
    const onExportBundle = vi.fn()
    const { container } = render(
      <PublishDialog
        open
        onClose={onClose}
        onExportBundle={onExportBundle}
        onCopyRichText={vi.fn()}
      />,
    )
    fireEvent.click(container.querySelector('.dialog-overlay')!)
    expect(onClose).toHaveBeenCalledOnce()
    expect(onExportBundle).not.toHaveBeenCalled()
  })
})
