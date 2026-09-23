// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StartScreen } from './index'
import { CORE_TASK_DISCOVER, CORE_TASK_HEADLINE } from '../../../../shared/product/core-task'

afterEach(() => cleanup())

describe('StartScreen（NEXT-UI-SPEC §7 空状态主动作）', () => {
  it('无知识库：主要动作是「打开知识库文件夹」，并展示 R11 核心任务表述', () => {
    render(<StartScreen onNew={vi.fn()} onOpen={vi.fn()} onOpenFolder={vi.fn()} />)
    const primary = document.querySelector('.start-btn.primary')
    expect(primary?.textContent).toContain('打开知识库文件夹')
    expect(screen.getByText(CORE_TASK_HEADLINE)).toBeTruthy()
    expect(screen.getByText(/示例任务/)).toBeTruthy()
    expect(screen.getByText(CORE_TASK_DISCOVER.citation)).toBeTruthy()
  })

  it('有知识库无最近记录：主要动作是「在此知识库新建」，提示可看侧栏最近编辑', () => {
    render(<StartScreen onNew={vi.fn()} onOpen={vi.fn()} onOpenFolder={vi.fn()} hasWorkspace />)
    const primary = document.querySelector('.start-btn.primary')
    expect(primary?.textContent).toContain('在此知识库新建')
    expect(screen.getByText('打开文件')).toBeTruthy()
    expect(screen.getByText('打开其他知识库')).toBeTruthy()
    expect(screen.queryByText('继续最近编辑')).toBeNull()
    expect(screen.getByText(/要继续上次写作/)).toBeTruthy()
    expect(screen.queryByText(/示例任务/)).toBeNull()
  })

  it('有知识库且有可继续文件：主要动作是「继续最近编辑」', () => {
    const onContinueRecent = vi.fn()
    render(
      <StartScreen
        onNew={vi.fn()}
        onOpen={vi.fn()}
        onOpenFolder={vi.fn()}
        hasWorkspace
        continueRecentLabel="notes/api.md"
        onContinueRecent={onContinueRecent}
      />,
    )
    const primary = document.querySelector('.start-btn.primary')
    expect(primary?.textContent).toContain('继续最近编辑')
    expect(screen.getByText('在此知识库新建')).toBeTruthy()
    expect(screen.getByText(/将打开「notes\/api.md」/)).toBeTruthy()
    fireEvent.click(primary!)
    expect(onContinueRecent).toHaveBeenCalledTimes(1)
  })

  it('有知识库时展示只读兼容说明，不提供改写原文的动作', () => {
    render(
      <StartScreen
        onNew={vi.fn()}
        onOpen={vi.fn()}
        onOpenFolder={vi.fn()}
        hasWorkspace
        notices={['索引没有覆盖全部文件，搜索和检查不能当成完整结果。']}
      />,
    )
    expect(screen.getByText(/不能当成完整结果/)).toBeTruthy()
    expect(document.body.textContent).not.toContain('改写原文')
  })

  it('不自动渲染任何「登录/同步/导览」类动作', () => {
    render(<StartScreen onNew={vi.fn()} onOpen={vi.fn()} onOpenFolder={vi.fn()} />)
    expect(document.body.textContent).not.toContain('登录')
    expect(document.body.textContent).not.toContain('同步')
    expect(document.body.textContent).not.toContain('导览')
    expect(document.body.textContent).not.toContain('打卡')
  })
})
