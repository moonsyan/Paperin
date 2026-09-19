import { describe, expect, it } from 'vitest'
import { foldRegions, formatStructured, lineOffset, stripJsonComments } from './structured-code'

describe('formatStructured', () => {
  it('把挤在一行的 JSON 展开，也能再压回去', () => {
    const pretty = formatStructured('json', '{"name":"纸间","tags":["a","b"]}', 'pretty')
    expect(pretty.ok).toBe(true)
    if (!pretty.ok) return
    expect(pretty.text).toBe('{\n  "name": "纸间",\n  "tags": [\n    "a",\n    "b"\n  ]\n}')
    const minified = formatStructured('JSON', pretty.text, 'minify')
    expect(minified).toEqual({ ok: true, text: '{"name":"纸间","tags":["a","b"]}' })
  })

  it('jsonc 去掉注释后再格式化', () => {
    const result = formatStructured('jsonc', '{ /* 说明 */ "a": 1 // 尾注\n}', 'pretty')
    expect(result).toEqual({ ok: true, text: '{\n  "a": 1\n}' })
  })

  it('没有语言标记、但内容是 JSON 时也可以格式化', () => {
    const result = formatStructured('', '{"a":1}', 'pretty')
    expect(result).toEqual({ ok: true, text: '{\n  "a": 1\n}' })
  })

  it('非法 JSON 不改原文', () => {
    expect(formatStructured('json', '{a:1}', 'pretty')).toEqual({ ok: false, message: '这不是合法的 JSON' })
  })

  it('YAML 保留注释并排齐，压成一行时去掉换行', () => {
    const pretty = formatStructured('yaml', 'name: 纸间\n# 备注\nlist:\n- a\n- b\n', 'pretty')
    expect(pretty.ok).toBe(true)
    if (!pretty.ok) return
    expect(pretty.text).toContain('name: 纸间')
    expect(pretty.text).toContain('# 备注')
    const minified = formatStructured('yml', 'name: 纸间\nlist:\n  - a\n  - b\n', 'minify')
    expect(minified.ok).toBe(true)
    if (!minified.ok) return
    expect(minified.text).not.toContain('\n')
    expect(minified.text).toContain('纸间')
  })

  it('非法 YAML 不改原文', () => {
    expect(formatStructured('yaml', ':\n  - [', 'pretty').ok).toBe(false)
  })
})

describe('foldRegions', () => {
  it('只标出至少盖住两行的缩进片段，收尾行留给外面', () => {
    const text = ['{', '  "user": {', '    "name": "一",', '    "city": "杭"', '  }', '}'].join('\n')
    expect(foldRegions(text)).toEqual([
      { startLine: 0, endLine: 5, label: '片段' },
      { startLine: 1, endLine: 4, label: 'user' },
    ])
    expect(lineOffset(text, 1)).toBe(2)
    expect(stripJsonComments('{"a":"http://x"}//x')).toBe('{"a":"http://x"}')
  })

  it('单字段对象不提供折叠', () => {
    expect(foldRegions('{\n  "a": 1\n}')).toEqual([])
  })
})
