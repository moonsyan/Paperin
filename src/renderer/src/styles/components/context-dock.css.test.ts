import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(
  join(process.cwd(), 'src/renderer/src/styles/components/context-dock.css'),
  'utf8',
)

describe('context-dock.css', () => {
  it('拖宽条落在面板内侧，不盖住编辑区右侧滚动条', () => {
    const resizerBlock = stylesheet.match(/\.context-dock-resizer\s*\{[^}]+\}/)?.[0] ?? ''
    expect(resizerBlock).toContain('left: 0')
    expect(resizerBlock).toContain('width: 6px')
    expect(resizerBlock).not.toMatch(/left:\s*-\d+px/)
  })
})
