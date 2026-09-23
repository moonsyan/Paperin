import { describe, expect, it } from 'vitest'
import { normalizeCodeLanguage } from './code-language'

describe('normalizeCodeLanguage', () => {
  it('小写化常见标识', () => {
    expect(normalizeCodeLanguage('JSON')).toBe('json')
    expect(normalizeCodeLanguage(' Yaml ')).toBe('yaml')
    expect(normalizeCodeLanguage('TypeScript')).toBe('typescript')
  })

  it('应用别名表', () => {
    expect(normalizeCodeLanguage('yml')).toBe('yaml')
    expect(normalizeCodeLanguage('YML')).toBe('yaml')
    expect(normalizeCodeLanguage('jsonc')).toBe('json5')
    expect(normalizeCodeLanguage('dockerfile')).toBe('docker')
    expect(normalizeCodeLanguage('Dockerfile')).toBe('docker')
    expect(normalizeCodeLanguage('ps1')).toBe('powershell')
    expect(normalizeCodeLanguage('proto')).toBe('protobuf')
    expect(normalizeCodeLanguage('tf')).toBe('hcl')
  })

  it('空串与未知标识', () => {
    expect(normalizeCodeLanguage('')).toBe('')
    expect(normalizeCodeLanguage('   ')).toBe('')
    expect(normalizeCodeLanguage('brainfuck')).toBe('brainfuck')
  })
})
