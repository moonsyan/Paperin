// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { createRef } from 'react'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { AppTopBar } from './app/AppTopBar'
import type { AppTopBarProps } from './app/AppTopBar'
import { SKIP_LINK_TARGET_ID, SkipLink } from './app/SkipLink'
import { CurrentFileBanner } from './components/CurrentFileBanner'
import { SidebarFlatList, SidebarFooter, SidebarQuickNav } from './components/Sidebar/SidebarQuickNav'
import { WorkspaceContext, WorkspaceShell } from './components/WorkspaceShell'

/**
 * 无障碍冒烟（组件级）：把「键盘/读屏用户能不能用」里可以机械判定的部分固定下来。
 *
 * 覆盖 2026-09 quiet-workspace 视觉迁移后的关键界面：顶栏三区、侧栏五段式、
 * 当前文件标识、工作区壳层。判定项只有两条，但都是纯键盘用户的实际阻塞点：
 * 1. 每个可交互元素都得有可访问名称（否则读屏只会念「按钮」）；
 * 2. 有状态的导航控件要把状态暴露出来（aria-pressed / aria-current），
 *    否则读屏用户不知道自己在哪个视图。
 *
 * 对比度与焦点可见性由 scripts/theme-contrast.mjs、scripts/focus-outline.mjs 负责，
 * 这里不重复。
 */

afterEach(() => cleanup())

/** 计算可访问名称（accname 的简化实现：aria-label → aria-labelledby → 文本 → title） */
const accessibleName = (el: Element): string => {
  const aria = el.getAttribute('aria-label')
  if (aria?.trim()) return aria.trim()
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) return text
  }
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (text) return text
  return (el.getAttribute('title') ?? '').trim()
}

const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="textbox"]',
  '[role="link"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const interactiveElements = (): Element[] => Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR))

const unnamedInteractive = (): string[] =>
  interactiveElements()
    .filter((el) => accessibleName(el) === '')
    .map((el) => el.outerHTML.slice(0, 120))

const topBarProps = (overrides: Partial<AppTopBarProps> = {}): AppTopBarProps => ({
  sidebarCollapsed: false,
  onToggleSidebar: vi.fn(),
  focusMode: false,
  onToggleFocusMode: vi.fn(),
  effectiveTheme: 'default',
  onThemeChange: vi.fn(),
  settingsOpen: false,
  onOpenSettings: vi.fn(),
  onAction: vi.fn(),
  recentFiles: [],
  shortcuts: {},
  openFiles: [{ id: 'file-1', name: '设计记录.md' }],
  docTitle: '设计记录.md',
  titleRef: createRef<HTMLDivElement>(),
  onTitleBlur: vi.fn(),
  onTitleKeyDown: vi.fn(),
  workspaceName: '我的知识库',
  workspacePath: 'D:/Notes',
  ...overrides,
})

describe('跳转链接（键盘直达正文）', () => {
  it('是带可访问名称的锚点，指向正文宿主容器', () => {
    render(<SkipLink />)
    const link = document.querySelector('.skip-link')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toBe(`#${SKIP_LINK_TARGET_ID}`)
    expect(accessibleName(link as Element)).toBe('跳到正文')
  })

  it('正文宿主容器接上了同一个 id 并可被锚点聚焦，样式在聚焦时滑入', async () => {
    // jsdom 环境下 import.meta.url 不是 file: 协议，改用 cwd 拼路径
    const read = (relative: string): Promise<string> =>
      readFile(join(process.cwd(), 'src/renderer/src', relative), 'utf8')

    const workspace = await read('app/AppWorkspace.tsx')
    expect(workspace).toContain('id={SKIP_LINK_TARGET_ID}')
    // 没有 tabIndex=-1 时锚点只会滚动而不会移动焦点，跳转链接等于失效
    expect(workspace).toContain('tabIndex={-1}')

    const composition = await read('app/AppComposition.tsx')
    expect(composition).toContain('<SkipLink />')

    const styles = await read('styles/global.css')
    // 只能用「移出视口」隐藏：display:none / visibility:hidden 会把它移出 Tab 序列
    expect(styles).toMatch(/\.skip-link\s*\{[^}]*transform:\s*translate\(-50%,\s*calc\(-100%/)
    expect(styles).toMatch(/\.skip-link:focus\s*\{\s*transform:\s*translate\(-50%,\s*0\)/)
    expect(styles).not.toMatch(/\.skip-link[^{]*\{[^}]*display:\s*none/)
  })
})

describe('顶栏三区', () => {
  it('所有可交互元素都有可访问名称', () => {
    render(<AppTopBar {...topBarProps()} />)
    // 先确认真的扫到了控件，避免选择器失配导致的「空扫通过」
    expect(interactiveElements().length).toBeGreaterThan(4)
    expect(unnamedInteractive()).toEqual([])
  })

  it('侧栏切换 / 专注模式 / 设置三个图标按钮可被读屏定位到', () => {
    render(<AppTopBar {...topBarProps()} />)
    for (const label of ['切换侧栏', '切换专注模式', '打开设置']) {
      expect(document.querySelector(`[aria-label="${label}"]`)).toBeTruthy()
    }
  })

  it('文档标题是可命名的编辑控件，而不是匿名 contentEditable', () => {
    render(<AppTopBar {...topBarProps()} />)
    const title = document.querySelector('.doc-title')
    expect(title?.getAttribute('role')).toBe('textbox')
    expect(title?.getAttribute('aria-label')).toBe('文档文件名')
  })

  it('工作区上下文点把「已打开 / 未打开」写进无障碍名', () => {
    render(<AppTopBar {...topBarProps({ workspaceName: '我的知识库', workspacePath: 'D:/Notes' })} />)
    expect(document.querySelector('.workspace-context')?.getAttribute('aria-label')).toContain('我的知识库')
    cleanup()

    render(<AppTopBar {...topBarProps({ workspaceName: '未打开知识库', workspacePath: null })} />)
    expect(document.querySelector('.workspace-context')?.getAttribute('aria-label')).toContain('尚未打开')
  })
})

describe('侧栏快捷导航', () => {
  const baseProps = {
    view: null as null | 'recent' | 'favorites',
    onViewChange: vi.fn(),
    recentCount: 3,
    favoriteCount: 1,
    collectionName: '我的知识库',
    collectionActive: true,
  }

  it('搜索触发框与底部入口都可被读屏定位', () => {
    render(
      <>
        <SidebarQuickNav {...baseProps} onOpenSearch={vi.fn()} onCreateFile={vi.fn()} />
        <SidebarFooter summary="32 个文档" onOpenSettings={vi.fn()} />
      </>,
    )
    expect(unnamedInteractive()).toEqual([])
  })

  it('当前视图用 aria-pressed 暴露，而不是只靠 .selected 类名', () => {
    render(<SidebarQuickNav {...baseProps} view="recent" collectionActive={false} />)
    const recent = document.querySelector('[title="最近编辑的文件"]')
    const favorites = document.querySelector('[title="我的收藏"]')
    expect(recent?.getAttribute('aria-pressed')).toBe('true')
    expect(favorites?.getAttribute('aria-pressed')).toBe('false')
  })

  it('集合标题在激活态下用 aria-current 暴露', () => {
    render(<SidebarQuickNav {...baseProps} />)
    const collection = document.querySelector('.collection-name')
    expect(collection?.getAttribute('aria-current')).toBe('true')
    cleanup()

    render(<SidebarQuickNav {...baseProps} view="recent" collectionActive={false} />)
    expect(document.querySelector('.collection-name')?.getAttribute('aria-current')).toBeNull()
  })
})

describe('侧栏扁平列表（最近编辑 / 收藏）', () => {
  const entries = [
    { key: 'a', name: 'a.md', path: 'D:/Notes/a.md' },
    { key: 'b', name: 'b.md', path: 'D:/Notes/b.md' },
  ]

  it('行是键盘可达的，且 Enter 与空格都能打开', () => {
    const onOpen = vi.fn()
    render(<SidebarFlatList entries={entries} activePath="D:/Notes/b.md" emptyLabel="最近编辑" onOpen={onOpen} />)

    const rows = Array.from(document.querySelectorAll('[role="listitem"]'))
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(rows[0], { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ path: 'D:/Notes/a.md' }))
    fireEvent.keyDown(rows[1], { key: ' ' })
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('空集合给出空状态文案而不是一片空白', () => {
    render(<SidebarFlatList entries={[]} emptyLabel="我的收藏" onOpen={vi.fn()} />)
    expect(document.body.textContent).toContain('我的收藏')
  })
})

describe('当前文件标识（顶栏右区紧凑形态）', () => {
  it('保留 role=status 与包含文件名/来源/保存状态的朗读文本', () => {
    render(
      <CurrentFileBanner
        title="设计记录.md"
        path="D:/Notes/设计记录.md"
        workspacePath="D:/Notes"
        workspaceName="我的知识库"
        source="workspace"
        dirty
      />,
    )

    const banner = document.querySelector('.current-file-banner')
    expect(banner?.getAttribute('role')).toBe('status')
    expect(banner?.getAttribute('aria-live')).toBe('polite')
    const label = banner?.getAttribute('aria-label') ?? ''
    expect(label).toContain('设计记录.md')
    expect(label).toContain('知识库文件')
    expect(label).toContain('未保存')
    expect(banner?.getAttribute('data-dirty')).toBe('true')
  })

  it('紧凑形态裁掉的路径信息仍留在无障碍树里', () => {
    render(
      <CurrentFileBanner
        title="设计记录.md"
        path="D:/Notes/设计记录.md"
        workspacePath="D:/Notes"
        workspaceName="我的知识库"
        source="workspace"
        dirty={false}
      />,
    )

    const hidden = Array.from(document.querySelectorAll('.sr-only')).map((el) => el.textContent)
    expect(hidden).toContain('我的知识库')
    expect(hidden).toContain('设计记录.md')
  })
})

describe('工作区壳层', () => {
  it('壳层是有名字的 region，状态可从 data 属性读出', () => {
    render(
      <WorkspaceShell workspacePath="D:/Notes">
        <div>正文</div>
      </WorkspaceShell>,
    )

    const shell = document.querySelector('.workspace-shell')
    expect(shell?.getAttribute('role')).toBe('region')
    expect(shell?.getAttribute('aria-label')).toBe('工作区')
    expect(shell?.getAttribute('data-workspace-state')).toBe('open')
  })

  it('上下文点在未打开知识库时给出明确状态', () => {
    render(<WorkspaceContext workspaceName="未打开知识库" workspacePath={null} />)
    const context = document.querySelector('.workspace-context')
    expect(context?.getAttribute('data-workspace-state')).toBe('empty')
    expect(context?.getAttribute('aria-label')).toContain('尚未打开知识库')
    expect(context?.getAttribute('title')).toBe('尚未打开知识库')
  })
})
