// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EditorMargin } from './index'
import { createDefaultPanelRegistry, createPanelRegistry } from '../../app/panels/panel-registry'
import type { PanelContext } from '../../app/panels/panel-registry'

afterEach(cleanup)

const context: PanelContext = { activeFileId: 'file-1', hasWorkspace: true }

describe('EditorMargin editor.margin 插槽消费', () => {
  it('默认注册表无 editor.margin 面板时不渲染任何 DOM', () => {
    const { container } = render(<EditorMargin context={context} registry={createDefaultPanelRegistry()} />)
    expect(container.firstChild).toBeNull()
  })

  it('注册的 editor.margin 面板渲染为正文页边栏', () => {
    const registry = createPanelRegistry()
    registry.register({
      id: 'margin-notes',
      slot: 'editor.margin',
      title: '关联笔记',
      order: 10,
      render: () => <div>页边内容</div>,
    })
    render(<EditorMargin context={context} registry={registry} />)
    expect(screen.getByRole('complementary', { name: '正文页边' })).toBeTruthy()
    expect(screen.getByText('页边内容')).toBeTruthy()
    expect(screen.getByLabelText('关联笔记')).toBeTruthy()
  })

  it('无 render 的面板与 enabled 过滤的面板不渲染', () => {
    const registry = createPanelRegistry()
    registry.register({ id: 'margin-empty', slot: 'editor.margin', title: '空' })
    registry.register({
      id: 'margin-off',
      slot: 'editor.margin',
      title: '关',
      enabled: () => false,
      render: () => <div>不应出现</div>,
    })
    const { container } = render(<EditorMargin context={context} registry={registry} />)
    expect(container.firstChild).toBeNull()
  })
})
