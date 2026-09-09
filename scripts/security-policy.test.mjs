import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const rendererHtmlUrl = new URL('../src/renderer/index.html', import.meta.url)

const readRendererPolicy = async () => {
  const html = await readFile(rendererHtmlUrl, 'utf8')
  const match = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)
  expect(match, '缺少 Renderer Content-Security-Policy meta').not.toBeNull()

  return new Map(
    match[1].split(';').map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/)
      return [name, sources]
    }),
  )
}

describe('Renderer Content-Security-Policy', () => {
  it('只为字体放行 data: 且不放宽脚本或连接来源', async () => {
    const policy = await readRendererPolicy()

    expect(policy.get('default-src')).toEqual(["'self'"])
    expect(policy.get('font-src')).toContain('data:')
    expect(policy.get('script-src')).toEqual(["'self'"])
    expect(policy.has('connect-src')).toBe(false)
    expect(
      [...policy.entries()]
        .filter(([, sources]) => sources.includes('data:'))
        .map(([directive]) => directive)
        .sort(),
    ).toEqual(['font-src', 'img-src'])
  })
})
