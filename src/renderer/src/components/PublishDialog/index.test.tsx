// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PublishDialog } from './index'

afterEach(() => cleanup())

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
})
