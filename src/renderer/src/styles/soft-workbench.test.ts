import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(join(process.cwd(), 'src/renderer/src/styles/soft-workbench.css'), 'utf8')

describe('Soft Workbench production skin', () => {
  it('styles the existing shell contracts without introducing a parallel layout', () => {
    for (const selector of ['.topbar', '.sidebar', '.brand', '.document-pathbar', '.editor-inner', '.tabbar', '.context-dock', '.statusbar']) {
      expect(stylesheet).toContain(selector)
    }
    expect(stylesheet).toContain('--soft-sidebar-width: 248px')
    expect(stylesheet).toContain('--soft-content-width: 720px')
  })

  it('keeps narrow-window and reduced-motion states explicit', () => {
    expect(stylesheet).toContain('@media (max-width: 820px)')
    expect(stylesheet).toContain('@media (max-width: 560px)')
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('uses semantic theme tokens for canvas, text and emphasis', () => {
    expect(stylesheet).toContain('background: var(--bg-app)')
    expect(stylesheet).toContain('color: var(--text-1)')
    expect(stylesheet).toContain('box-shadow: inset 3px 0 0 var(--accent)')
  })
})
