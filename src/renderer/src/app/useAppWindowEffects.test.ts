// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActiveConfirmRequest } from '../components/ConfirmDialog'
import { useAppWindowEffects } from './useAppWindowEffects'

afterEach(cleanup)

describe('useAppWindowEffects', () => {
  it('新输入未确认时窗口标题与卸载保护都保留未保存提示', () => {
    const { rerender } = renderHook(({ dirty }) => {
      const [, setConfirmRequest] = useState<ActiveConfirmRequest | null>(null)
      const [, setToast] = useState('')
      useAppWindowEffects({
        effectiveTheme: 'default', fontSize: 16, contentWidth: 700,
        lineHeight: 1.5, contentFont: 'default', saved: !dirty,
        docTitle: '中文笔记', documents: { note: { dirty } },
        setConfirmRequest, toast: '', setToast,
      })
    }, { initialProps: { dirty: true } })
    expect(document.title).toBe('● 中文笔记 — Paperin')
    const blocked = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(blocked)
    expect(blocked.defaultPrevented).toBe(true)
    rerender({ dirty: false })
    expect(document.title).toBe('中文笔记 — Paperin')
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
  })
})
