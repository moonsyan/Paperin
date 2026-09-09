// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CurrentFileBanner } from './index'

afterEach(() => cleanup())

describe('CurrentFileBanner', () => {
  it('展示工作区文件的标题、相对路径和已保存状态', () => {
    render(
      <CurrentFileBanner
        title="设计记录"
        path="D:/Notes/projects/design.md"
        workspacePath="D:/Notes"
        workspaceName="我的知识库"
        source="workspace"
        dirty={false}
      />,
    )

    expect(screen.getByRole('status').textContent).toContain('设计记录')
    expect(screen.getByText('projects/design.md')).toBeTruthy()
    expect(screen.getByText('我的知识库')).toBeTruthy()
    expect(screen.getByText('已保存')).toBeTruthy()
    expect(screen.getByRole('status').getAttribute('data-source')).toBe('workspace')
  })

  it('明确标记知识库之外的外部文件和未保存状态', () => {
    render(
      <CurrentFileBanner
        title="临时笔记"
        path="C:/Temp/note.md"
        workspacePath="D:/Notes"
        workspaceName="我的知识库"
        source="external"
        dirty
      />,
    )

    expect(screen.getByText('外部文件')).toBeTruthy()
    expect(screen.getByText('未保存')).toBeTruthy()
    expect(screen.getByText('C:/Temp/note.md')).toBeTruthy()
    expect(screen.getByRole('status').getAttribute('data-source')).toBe('external')
  })
})
