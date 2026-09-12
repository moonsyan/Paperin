// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../data/shortcuts', () => ({
  comboFromEvent: vi.fn(),
}))

import { useGlobalShortcuts } from './useGlobalShortcuts'
import { comboFromEvent } from '../data/shortcuts'

const mockedCombo = vi.mocked(comboFromEvent)

afterEach(() => {
  vi.restoreAllMocks()
})

function createOpts(overrides: Record<string, unknown> = {}) {
  return {
    shortcutLookupRef: { current: {} as Record<string, string> },
    modalOpenRef: { current: false },
    fullscreenOpenRef: { current: false },
    dispatchAction: vi.fn(),
    ...overrides,
  } as Parameters<typeof useGlobalShortcuts>[0]
}

function dispatchKey(combo: string) {
  const event = new KeyboardEvent('keydown', { key: 'k', bubbles: true })
  mockedCombo.mockReturnValue(combo)
  window.dispatchEvent(event)
}

describe('useGlobalShortcuts', () => {
  it('注册 keydown 监听，卸载后移除', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useGlobalShortcuts(createOpts()))
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('模态框打开时不响应快捷键', () => {
    const dispatchAction = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      dispatchAction,
      modalOpenRef: { current: true },
      shortcutLookupRef: { current: { 'Ctrl+N': 'new' } },
    })))
    dispatchKey('Ctrl+N')
    expect(dispatchAction).not.toHaveBeenCalled()
  })

  it('comboFromEvent 返回空串时不触发', () => {
    const dispatchAction = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      dispatchAction,
      shortcutLookupRef: { current: { 'Ctrl+N': 'new' } },
    })))
    dispatchKey('')
    expect(dispatchAction).not.toHaveBeenCalled()
  })

  it('defaultPrevented 不触发', () => {
    const dispatchAction = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      dispatchAction,
      shortcutLookupRef: { current: { 'Ctrl+N': 'new' } },
    })))
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })
    const preventer = (e: Event) => { e.preventDefault() }
    window.addEventListener('keydown', preventer, { capture: true })
    window.dispatchEvent(event)
    window.removeEventListener('keydown', preventer, { capture: true })
    expect(dispatchAction).not.toHaveBeenCalled()
  })

  it('repeat 不触发', () => {
    const dispatchAction = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      dispatchAction,
      shortcutLookupRef: { current: { 'Ctrl+N': 'new' } },
    })))
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, repeat: true, bubbles: true })
    window.dispatchEvent(event)
    expect(dispatchAction).not.toHaveBeenCalled()
  })

  it('匹配快捷键表时经 dispatchAction 统一分发', () => {
    const dispatchAction = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      dispatchAction,
      shortcutLookupRef: { current: { 'Ctrl+S': 'save' } },
    })))
    dispatchKey('Ctrl+S')
    expect(dispatchAction).toHaveBeenCalledWith('save')
  })

  it('快捷键与菜单共享同一分发入口（全部动作走 dispatchAction）', () => {
    const dispatchAction = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      dispatchAction,
      shortcutLookupRef: {
        current: {
          'Ctrl+N': 'new',
          'Ctrl+O': 'open',
          'Ctrl+Shift+O': 'openFolder',
          'Ctrl+Shift+S': 'saveAs',
          'Ctrl+W': 'closeTab',
          'Ctrl+J': 'toggleSidebar',
          'Ctrl+Shift+L': 'outline',
          'Ctrl+P': 'commandPalette',
          'F11': 'focusMode',
          'Ctrl+Shift+P': 'preview',
          'Ctrl+=': 'zoomIn',
        },
      },
    })))
    dispatchKey('Ctrl+N')
    dispatchKey('Ctrl+O')
    dispatchKey('Ctrl+Shift+O')
    dispatchKey('Ctrl+Shift+S')
    dispatchKey('Ctrl+W')
    dispatchKey('Ctrl+J')
    dispatchKey('Ctrl+Shift+L')
    dispatchKey('Ctrl+P')
    dispatchKey('F11')
    dispatchKey('Ctrl+Shift+P')
    dispatchKey('Ctrl+=')
    expect(dispatchAction.mock.calls.map(([action]) => action)).toEqual([
      'new',
      'open',
      'openFolder',
      'saveAs',
      'closeTab',
      'toggleSidebar',
      'outline',
      'commandPalette',
      'focusMode',
      'preview',
      'zoomIn',
    ])
  })

  it('未匹配快捷键表时不分发', () => {
    const dispatchAction = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      dispatchAction,
      shortcutLookupRef: { current: {} },
    })))
    dispatchKey('Ctrl+X')
    expect(dispatchAction).not.toHaveBeenCalled()
  })

  it('find/replace 正常分发', () => {
    const dispatchAction = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      dispatchAction,
      shortcutLookupRef: { current: { 'Ctrl+F': 'find', 'Ctrl+H': 'replace' } },
    })))
    dispatchKey('Ctrl+F')
    dispatchKey('Ctrl+H')
    expect(dispatchAction).toHaveBeenCalledWith('find')
    expect(dispatchAction).toHaveBeenCalledWith('replace')
  })

  it('全屏模式下不触发 find/replace', () => {
    const dispatchAction = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      dispatchAction,
      fullscreenOpenRef: { current: true },
      shortcutLookupRef: { current: { 'Ctrl+F': 'find', 'Ctrl+H': 'replace' } },
    })))
    dispatchKey('Ctrl+F')
    dispatchKey('Ctrl+H')
    expect(dispatchAction).not.toHaveBeenCalled()
  })

  it('可编辑目标内不触发快捷键', () => {
    const dispatchAction = vi.fn()
    renderHook(() => useGlobalShortcuts(createOpts({
      dispatchAction,
      shortcutLookupRef: { current: { 'Ctrl+N': 'new' } },
    })))
    const input = document.createElement('input')
    document.body.appendChild(input)
    mockedCombo.mockReturnValue('Ctrl+N')
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })
    input.dispatchEvent(event)
    expect(dispatchAction).not.toHaveBeenCalled()
    input.remove()
  })
})
