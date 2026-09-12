// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { WorkspaceShell, WorkspaceContext } from './index'

afterEach(() => cleanup())

describe('WorkspaceShell', () => {
  it('持续呈现工作区语义并保留工作区内容', () => {
    render(
      <WorkspaceShell workspacePath="D:/Notes">
        <div data-testid="workspace-content">文件树与编辑器</div>
      </WorkspaceShell>,
    )

    const region = screen.getByRole('region', { name: '工作区' })
    expect(region).toBeTruthy()
    expect(region.getAttribute('data-workspace-state')).toBe('open')
    expect(screen.getByTestId('workspace-content')).toBeTruthy()
  })

  it('没有知识库时标记为空工作区并保留内容', () => {
    render(
      <WorkspaceShell>
        <span>开始界面</span>
      </WorkspaceShell>,
    )

    expect(screen.getByRole('region', { name: '工作区' }).getAttribute('data-workspace-state')).toBe('empty')
    expect(screen.getByText('开始界面')).toBeTruthy()
  })
})

describe('WorkspaceContext（顶栏左区工作区上下文点）', () => {
  it('呈现工作区名、本地标与完整路径', () => {
    render(<WorkspaceContext workspaceName="我的知识库" workspacePath="D:/Notes" />)

    expect(screen.getByText('我的知识库')).toBeTruthy()
    expect(screen.getByText('本地')).toBeTruthy()
    expect(screen.getByTitle('D:/Notes')).toBeTruthy()
    expect(screen.getByLabelText('当前工作区：我的知识库')).toBeTruthy()
  })

  it('没有知识库时给出明确的空状态', () => {
    render(<WorkspaceContext workspaceName="未打开知识库" />)

    expect(screen.getByText('未打开知识库')).toBeTruthy()
    expect(screen.getByText('未打开')).toBeTruthy()
    expect(screen.getByTitle('尚未打开知识库')).toBeTruthy()
  })
})
