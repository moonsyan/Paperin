import { parse, parseDocument, stringify } from 'yaml'

export type StructuredKind = 'json' | 'yaml'

export interface FoldRegion {
  /** 折叠起点行，从 0 计。这一行保持可见。 */
  startLine: number
  /** 下一同级行。隐藏范围到这一行之前，所以收尾的括号仍可见。 */
  endLine: number
  label: string
}

export type StructuredEdit =
  | { ok: true; text: string }
  | { ok: false; message: string }

const indentOf = (line: string): number => line.match(/^[ \t]*/)?.[0].length ?? 0

export function structuredKind(language: string, text = ''): StructuredKind | null {
  const lang = language.trim().toLowerCase()
  if (lang === 'json' || lang === 'jsonc' || lang === 'json5') return 'json'
  if (lang === 'yaml' || lang === 'yml') return 'yaml'
  const trimmed = text.trim()
  if (lang || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null
  try {
    JSON.parse(trimmed)
    return 'json'
  } catch {
    return null
  }
}

/** 去掉 JSON 字符串以外的注释，供 jsonc 格式化。不尝试修复尾逗号。 */
export function stripJsonComments(input: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]
    if (inString) {
      out += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === '/' && next === '/') {
      index += 1
      while (index + 1 < input.length && input[index + 1] !== '\n') index += 1
      continue
    }
    if (char === '/' && next === '*') {
      index += 2
      while (index < input.length && !(input[index] === '*' && input[index + 1] === '/')) index += 1
      index += 1
      continue
    }
    out += char
  }
  return out
}

export function lineOffset(text: string, line: number): number {
  if (line <= 0) return 0
  let seen = 0
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '\n') continue
    seen += 1
    if (seen === line) return index + 1
  }
  return text.length
}

/**
 * 按缩进找可折叠片段。格式化后的 JSON 和 YAML 都满足“子行更深”。
 * 至少要有两行被盖住，避免每个单字段都出现折叠按钮。
 */
export function foldRegions(text: string): FoldRegion[] {
  const lines = text.split('\n')
  const regions: FoldRegion[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue
    const indent = indentOf(lines[index])
    let end = index + 1
    let nested = false
    while (end < lines.length) {
      if (!lines[end].trim()) {
        end += 1
        continue
      }
      if (indentOf(lines[end]) <= indent) break
      nested = true
      end += 1
    }
    if (!nested || end - index < 3) continue
    const raw = lines[index].trim().replace(/:.*/, '').replace(/[{}[\],]/g, ' ').replace(/["']/g, '').trim()
    regions.push({
      startLine: index,
      endLine: end,
      label: (raw || '片段').slice(0, 24),
    })
  }
  return regions
}

function formatJson(text: string, comments: boolean, minify: boolean): string {
  const source = comments ? stripJsonComments(text) : text
  const value: unknown = JSON.parse(source)
  return minify ? JSON.stringify(value) : JSON.stringify(value, null, 2)
}

function formatYaml(text: string, minify: boolean): string {
  // yaml 包把别名展开默认限制在 100 次，避免恶意锚点把界面卡死。
  if (minify) return stringify(parse(text), { collectionStyle: 'flow', lineWidth: 0 }).trim()
  const doc = parseDocument(text)
  if (doc.errors.length > 0) throw doc.errors[0]
  return doc.toString().replace(/\n$/, '')
}

export function formatStructured(language: string, text: string, mode: 'pretty' | 'minify'): StructuredEdit {
  const kind = structuredKind(language, text)
  if (!kind) return { ok: false, message: '这个代码块不是 JSON 或 YAML' }
  if (!text.trim()) return { ok: false, message: '没有可整理的内容' }
  try {
    const next = kind === 'json'
      ? formatJson(text, language.trim().toLowerCase() === 'jsonc', mode === 'minify')
      : formatYaml(text, mode === 'minify')
    return { ok: true, text: next }
  } catch {
    return { ok: false, message: kind === 'json' ? '这不是合法的 JSON' : '这不是合法的 YAML' }
  }
}
