import { describe, expect, it, vi } from 'vitest'
import { createEditorAdapter, createEditorSubscription } from './editor-adapter'

describe('EditorAdapter', () => {
  it('keeps editor operations behind a narrow interface', () => {
    const focus = vi.fn()
    const write = vi.fn()
    const dispatch = vi.fn(() => true)
    const adapter = createEditorAdapter(() => '# 标题', write, focus, dispatch)
    expect(adapter.getMarkdown()).toBe('# 标题')
    adapter.setMarkdown('正文')
    adapter.focus()
    expect(adapter.runCommand('bold')).toBe(true)
    expect(write).toHaveBeenCalledWith('正文')
    expect(focus).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith('bold')
  })

  it('returns an unsubscribe function for future editor events', () => {
    const adapter = createEditorAdapter(() => '', () => undefined, () => undefined, () => false)
    const listener = vi.fn()
    const unsubscribe = adapter.subscribe(listener)
    adapter.notify('内容')
    expect(listener).toHaveBeenCalledWith('内容')
    expect(unsubscribe()).toBe(true)
    adapter.notify('后续')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('clears component subscriptions when the editor unmounts', () => {
    const subscription = createEditorSubscription()
    const adapter = createEditorAdapter(
      () => '',
      () => undefined,
      () => undefined,
      () => false,
      subscription,
    )
    const first = vi.fn()
    const second = vi.fn()
    adapter.subscribe(first)
    adapter.subscribe(second)

    subscription.notify('第一次')
    subscription.clear()
    subscription.notify('卸载后')

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })
})
