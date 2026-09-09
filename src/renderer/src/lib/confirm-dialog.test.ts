import { describe, expect, it, vi } from 'vitest'
import { requestConfirm, setConfirmDialogListener } from './confirm-dialog'

describe('requestConfirm（Promise 化确认对话框）', () => {
  it('未挂载监听器时 fail-closed 返回 cancel（等待方不悬挂）', async () => {
    setConfirmDialogListener(null)
    await expect(
      requestConfirm({ title: 't', message: 'm', buttons: [{ id: 'ok', label: '确定' }] }),
    ).resolves.toBe('cancel')
  })

  it('监听器接收请求并回传用户选择', async () => {
    const listener = vi.fn((_req, resolve: (id: string) => void) => resolve('save'))
    setConfirmDialogListener(listener)
    try {
      const result = await requestConfirm({
        title: '关闭文档',
        message: '尚未保存',
        buttons: [
          { id: 'save', label: '保存' },
          { id: 'discard', label: '不保存' },
          { id: 'cancel', label: '取消' },
        ],
      })
      expect(result).toBe('save')
      expect(listener).toHaveBeenCalledTimes(1)
      const request = listener.mock.calls[0][0] as { title: string; buttons: { id: string }[] }
      expect(request.title).toBe('关闭文档')
      expect(request.buttons.map((b) => b.id)).toEqual(['save', 'discard', 'cancel'])
    } finally {
      setConfirmDialogListener(null)
    }
  })

  it('监听器替换时新请求到新监听器', async () => {
    const first = vi.fn()
    setConfirmDialogListener(first)
    const second = vi.fn((_req, resolve: (id: string) => void) => resolve('discard'))
    setConfirmDialogListener(second)
    try {
      const result = await requestConfirm({
        title: 't',
        message: 'm',
        buttons: [{ id: 'discard', label: '不保存' }],
      })
      expect(result).toBe('discard')
      expect(first).not.toHaveBeenCalled()
      expect(second).toHaveBeenCalledTimes(1)
    } finally {
      setConfirmDialogListener(null)
    }
  })
})
