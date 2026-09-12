// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { AppTopBar } from './AppTopBar'
import type { AppTopBarProps } from './AppTopBar'

afterEach(() => cleanup())

const createProps = (overrides: Partial<AppTopBarProps> = {}): AppTopBarProps => ({
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

describe('AppTopBar（三区收缩）', () => {
  it('左区承载品牌与工作区上下文点；侧栏展开时保留产品品牌', () => {
    render(<AppTopBar {...createProps()} />)

    const left = document.querySelector('.topbar-zone-left')
    expect(left).toBeTruthy()
    expect(left?.querySelector('.brand-name')?.textContent).toBe('MarkdownSoft')
    // 工作区上下文在侧栏展开时仍以状态标识为主，避免挤占标签区域
    expect(left?.querySelector('.workspace-context-name')).toBeNull()
    expect(left?.querySelector('.workspace-context-label')?.textContent).toBe('本地')
    // 库名仍保留在无障碍名中
    expect(screen.getByLabelText('当前工作区：我的知识库')).toBeTruthy()
    // 工作区上下文点已并入顶栏，不再有独立的 38px 上下文横条
    expect(document.querySelector('.workspace-shell-context')).toBeNull()
  })

  it('侧栏收起时顶栏显示简短库名（NEXT-UI-SPEC §3.1）', () => {
    render(<AppTopBar {...createProps({ sidebarCollapsed: true })} />)

    const left = document.querySelector('.topbar-zone-left')
    expect(left?.querySelector('.brand')).toBeNull()
    expect(left?.querySelector('.workspace-context-name')?.textContent).toBe('我的知识库')
  })

  it('中区承载标签栏插槽', () => {
    render(<AppTopBar {...createProps({ tabs: <div data-testid="tabs-slot">标签栏</div> })} />)

    const center = document.querySelector('.topbar-zone-center')
    expect(center?.querySelector('[data-testid="tabs-slot"]')).toBeTruthy()
  })

  it('右区承载当前文件标识、文档标题与操作按钮组', () => {
    render(<AppTopBar {...createProps({ fileContext: <span data-testid="file-ctx">知识库文件</span> })} />)

    const right = document.querySelector('.topbar-zone-right')
    expect(right?.querySelector('[data-testid="file-ctx"]')).toBeTruthy()
    expect(right?.querySelector('.doc-title')?.textContent).toBe('设计记录.md')
    expect(right?.querySelector('.act-group')).toBeTruthy()
    // 切换侧栏按钮已迁至左区
    expect(document.querySelector('.topbar-zone-left .act-btn')).toBeTruthy()
  })

  it('没有打开文件时不渲染文档标题，但侧栏切换仍可用', () => {
    const onToggleSidebar = vi.fn()
    render(<AppTopBar {...createProps({ openFiles: [], onToggleSidebar })} />)

    expect(document.querySelector('.doc-title')).toBeNull()
    fireEvent.click(screen.getByLabelText('切换侧栏'))
    expect(onToggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('未打开知识库时上下文点进入空状态', () => {
    render(<AppTopBar {...createProps({ workspaceName: '未打开知识库', workspacePath: null })} />)

    const context = document.querySelector('.workspace-context')
    expect(context?.getAttribute('data-workspace-state')).toBe('empty')
    expect(context?.querySelector('.workspace-context-label')?.textContent).toBe('未打开')
  })
})
