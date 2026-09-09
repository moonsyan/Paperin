import { describe, expect, it } from 'vitest'
import { refractor } from 'refractor'

import { configureCodeBlockRefractor } from './syntaxHighlighting'

describe('configureCodeBlockRefractor', () => {
  it('把 Mermaid 作为纯文本语言注册，且可重复调用', () => {
    configureCodeBlockRefractor(refractor)
    configureCodeBlockRefractor(refractor)

    expect(refractor.registered('mermaid')).toBe(true)
    expect(refractor.highlight('graph TD', 'mermaid')).toEqual({
      type: 'root',
      children: [{ type: 'text', value: 'graph TD' }],
    })
  })
})
