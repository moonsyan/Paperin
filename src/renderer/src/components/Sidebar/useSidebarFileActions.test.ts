// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import type { MouseEvent } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSidebarFileActions } from './useSidebarFileActions'

afterEach(cleanup)
it('菜单关闭恢复触发行焦点；输入法组合态 Escape 不关闭', () => {
  const trigger = document.createElement('button')
  document.body.append(trigger)
  const { result } = renderHook(() => useSidebarFileActions(true))
  act(() => result.current.openCtxMenu({ clientX: 10, clientY: 10, currentTarget: trigger, preventDefault: vi.fn() } as unknown as MouseEvent,
    { key: 'note', name: '笔记.md', kind: 'file', path: '/notes/笔记.md' }))
  fireEvent.keyDown(document, { key: 'Escape', isComposing: true })
  expect(result.current.ctxMenu).not.toBeNull()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(result.current.ctxMenu).toBeNull()
  expect(document.activeElement).toBe(trigger)
  trigger.remove()
})
