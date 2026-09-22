// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SupportSummaryDialog } from './index'
import { buildSupportSummary } from '../../../../shared/support-summary'

const sample = buildSupportSummary(
  {
    appVersion: '0.7.0',
    platform: 'win32',
    arch: 'x64',
    electronVersion: '33.0.0',
    autoUpdateEnabled: true,
    eventCounts: {},
    recentErrorCodes: ['IO_ERROR'],
  },
  { documentCount: 3, indexComplete: true, diagnosticsByCode: { BROKEN_LINK: 1 } },
)

afterEach(() => cleanup())

describe('SupportSummaryDialog', () => {
  it('预览 JSON 且取消保存不写文件', async () => {
    const onSave = vi.fn(async () => ({ ok: false, error: { code: 'CANCELLED' } }))
    render(
      <SupportSummaryDialog
        open
        summary={sample}
        loading={false}
        onClose={vi.fn()}
        onSave={onSave}
        onExportTemp={vi.fn()}
      />,
    )
    expect(screen.getByRole('dialog', { name: /支持摘要/ })).toBeTruthy()
    const preview = screen.getByLabelText('支持摘要 JSON 预览') as HTMLTextAreaElement
    expect(preview.value).toContain('"schemaVersion": 1')
    fireEvent.click(screen.getByRole('button', { name: '另存为…' }))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(await screen.findByText('已取消保存。')).toBeTruthy()
  })

  it('Escape 关闭对话框', () => {
    const onClose = vi.fn()
    render(
      <SupportSummaryDialog
        open
        summary={sample}
        loading={false}
        onClose={onClose}
        onSave={vi.fn()}
        onExportTemp={vi.fn()}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
