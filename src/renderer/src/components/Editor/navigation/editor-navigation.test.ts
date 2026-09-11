import { describe, expect, it } from 'vitest'
import { isAtNodeTextBoundary, getNodeExitTargetDirection } from './editor-navigation'
import { handleEditorNavigationKeyDown } from './useEditorNavigation'

describe('isAtNodeTextBoundary', () => {
  it('在代码块最后一行时允许向下跳出', () => {
    expect(isAtNodeTextBoundary('first\nlast', 'down', 'first\n'.length)).toBe(true)
  })

  it('在代码块第一行时允许向上跳出', () => {
    expect(isAtNodeTextBoundary('first\nlast', 'up', 'first'.length)).toBe(true)
  })

  it('光标位于中间行时不跳出代码块', () => {
    expect(isAtNodeTextBoundary('first\nmiddle\nlast', 'down', 'first\n'.length)).toBe(false)
    expect(isAtNodeTextBoundary('first\nmiddle\nlast', 'up', 'first\nmiddle'.length)).toBe(false)
  })
})

describe('getNodeExitTargetDirection', () => {
  it('代码块第一行按向上键时选择块前目标', () => {
    expect(getNodeExitTargetDirection('first\nlast', 'up', 'first'.length)).toBe('before')
  })

  it('代码块最后一行按向下键时选择块后目标', () => {
    expect(getNodeExitTargetDirection('first\nlast', 'down', 'first\n'.length)).toBe('after')
  })

  it('光标不在边界（中间行）时不返回方向', () => {
    expect(getNodeExitTargetDirection('first\nmiddle\nlast', 'down', 'first\n'.length)).toBe(null)
    expect(getNodeExitTargetDirection('first\nmiddle\nlast', 'up', 'first\nmiddle'.length)).toBe(null)
  })
})

describe('handleEditorNavigationKeyDown', () => {
  it('代码块未处理的向上键会进入 frontmatter 并阻止默认行为', () => {
    let defaultPrevented = false
    let frontmatterEntered = false
    const event = {
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: 'ArrowUp',
      nativeEvent: { isComposing: false, keyCode: 0 },
      preventDefault: () => {
        defaultPrevented = true
      },
    } as unknown as React.KeyboardEvent

    handleEditorNavigationKeyDown(event, {
      exitCodeBlock: () => false,
      enterFrontmatter: () => {
        frontmatterEntered = true
        return true
      },
    })

    expect(frontmatterEntered).toBe(true)
    expect(defaultPrevented).toBe(true)
  })
})
