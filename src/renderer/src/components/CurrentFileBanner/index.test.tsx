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

  it('无路径的未命名文档即使没有编辑也不宣称已保存', () => {
    render(<CurrentFileBanner title="未命名 1.md" source="workspace" dirty={false} />)
    expect(screen.getByText('尚未保存到磁盘')).toBeTruthy()
    expect(screen.queryByText('已保存')).toBeNull()
    expect(screen.getByRole('status').getAttribute('aria-label')).toContain('尚未保存到磁盘')
  })

  it('无路径的示例文档区分阅读态和未保存修改', () => {
    const { rerender } = render(<CurrentFileBanner title="欢迎使用.md" source="workspace" storageKind="demo" dirty={false} />)
    expect(screen.getByText('示例文档')).toBeTruthy()
    expect(screen.queryByText('已保存')).toBeNull()
    rerender(<CurrentFileBanner title="欢迎使用.md" source="workspace" storageKind="demo" dirty />)
    expect(screen.getByText('示例 · 有未保存修改')).toBeTruthy()
  })

  it('保存中文案优先于已保存', () => {
    render(
      <CurrentFileBanner
        title="设计记录"
        path="D:/Notes/design.md"
        source="workspace"
        dirty={false}
        saveActivity="saving"
      />,
    )
    expect(screen.getByText('正在保存…')).toBeTruthy()
    expect(screen.getByRole('status').getAttribute('data-save-activity')).toBe('saving')
  })
})
