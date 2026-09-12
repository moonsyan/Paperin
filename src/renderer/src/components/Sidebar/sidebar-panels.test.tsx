// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from './index'
import { createDefaultPanelRegistry, createPanelRegistry } from '../../app/panels/panel-registry'

afterEach(cleanup)

const baseProps = {
  demoTree: [],
  demoFileNames: {},
  workspace: null,
  activeFileId: 'file-D:/draft/out.md',
  onSelectDemoFile: vi.fn(),
  onSelectWorkspaceFile: vi.fn(),
  openFiles: [{ id: 'file-D:/draft/out.md', name: 'out.md', path: 'D:/draft/out.md' }],
}

describe('Sidebar sidebar.primary 插槽消费', () => {
  it('默认注册表：内置 files 面板渲染文件树', () => {
    render(<Sidebar {...baseProps} registry={createDefaultPanelRegistry()} />)
    expect(screen.getByRole('tabpanel', { name: '文件' })).toBeTruthy()
    expect(screen.getByRole('tree', { name: '文件列表' })).toBeTruthy()
  })

  it('注册表未注册 files 面板时不渲染文件树', () => {
    render(<Sidebar {...baseProps} registry={createPanelRegistry()} />)
    expect(screen.queryByRole('tabpanel', { name: '文件' })).toBeNull()
    expect(screen.queryByRole('tree', { name: '文件列表' })).toBeNull()
  })

  it('扩展 primary 面板经 render(context) 追加渲染', () => {
    const registry = createDefaultPanelRegistry()
    registry.register({
      id: 'recent',
      slot: 'sidebar.primary',
      title: '最近',
      order: 20,
      render: () => <div>自定义最近面板</div>,
    })
    render(<Sidebar {...baseProps} registry={registry} />)
    expect(screen.getByRole('tabpanel', { name: '文件' })).toBeTruthy()
    expect(screen.getByRole('tabpanel', { name: '最近' })).toBeTruthy()
    expect(screen.getByText('自定义最近面板')).toBeTruthy()
  })

  it('enabled 过滤后的面板不渲染', () => {
    const registry = createDefaultPanelRegistry()
    registry.register({
      id: 'hidden-panel',
      slot: 'sidebar.primary',
      title: '隐藏',
      enabled: () => false,
      render: () => <div>不应出现</div>,
    })
    render(<Sidebar {...baseProps} registry={registry} />)
    expect(screen.queryByText('不应出现')).toBeNull()
  })
})
