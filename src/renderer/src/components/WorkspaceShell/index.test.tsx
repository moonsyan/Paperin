// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { WorkspaceShell } from './index'

afterEach(() => cleanup())

describe('WorkspaceShell', () => {
  it('持续呈现工作区上下文并保留工作区内容', () => {
    render(
      <WorkspaceShell workspaceName="我的知识库" workspacePath="D:/Notes">
        <div data-testid="workspace-content">文件树与编辑器</div>
      </WorkspaceShell>,
    )

    expect(screen.getByRole('region', { name: '工作区' })).toBeTruthy()
    expect(screen.getByText('我的知识库')).toBeTruthy()
    expect(screen.getByText('D:/Notes')).toBeTruthy()
    expect(screen.getByTestId('workspace-content')).toBeTruthy()
  })

  it('没有知识库时仍提供明确的本地工作区上下文', () => {
    render(
      <WorkspaceShell workspaceName="未打开知识库">
        <span>开始界面</span>
      </WorkspaceShell>,
    )

    expect(screen.getByRole('region', { name: '工作区' }).getAttribute('data-workspace-state')).toBe('empty')
    expect(screen.getByText('未打开知识库')).toBeTruthy()
  })
})
