import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sidebarCss = readFileSync(
  join(process.cwd(), 'src/renderer/src/styles/components/sidebar.css'),
  'utf8',
)
const globalCss = readFileSync(
  join(process.cwd(), 'src/renderer/src/styles/global.css'),
  'utf8',
)

describe('侧栏文件树滚动契约', () => {
  it('不在 .sidebar 上使用 CSS zoom，避免大目录被裁切且无法滚到底', () => {
    const sidebarRule = sidebarCss.match(/\.sidebar\s*\{([\s\S]*?)\n\}/)
    expect(sidebarRule?.[1]).not.toMatch(/\bzoom\s*:/)
    expect(sidebarRule?.[1]).toMatch(/min-height:\s*0/)
    expect(sidebarRule?.[1]).toMatch(/font-size:\s*calc\(15px \* var\(--editor-zoom/)
  })

  it('侧栏正文区可纵向滚动，工作区 flex 子项可收缩', () => {
    expect(sidebarCss).toMatch(/\.sidebar-body\s*\{[\s\S]*?overflow-y:\s*auto/)
    expect(sidebarCss).toMatch(/\.sidebar-body\s*\{[\s\S]*?min-height:\s*0/)
    const workspaceRule = globalCss.match(/\.workspace\s*\{([\s\S]*?)\n\}/)
    expect(workspaceRule?.[1]).toMatch(/min-height:\s*0/)
  })
})
