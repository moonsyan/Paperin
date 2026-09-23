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

  it('注册技术文档常用扩展语言', () => {
    configureCodeBlockRefractor(refractor)

    for (const language of [
      'toml',
      'tsx',
      'jsx',
      'graphql',
      'docker',
      'dockerfile',
      'powershell',
      'dart',
      'json5',
      'http',
      'nginx',
      'protobuf',
      'cmake',
      'wasm',
      'hcl',
      'elixir',
      'haskell',
      'scala',
      'zig',
      'json',
      'yaml',
      'yml',
    ]) {
      expect(refractor.registered(language), language).toBe(true)
    }
  })
})
