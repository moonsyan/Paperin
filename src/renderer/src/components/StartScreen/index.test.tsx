// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StartScreen } from './index'

afterEach(() => cleanup())

describe('StartScreen（NEXT-UI-SPEC §7 空状态主动作）', () => {
  it('无知识库：主要动作是「打开知识库文件夹」', () => {
    render(<StartScreen onNew={vi.fn()} onOpen={vi.fn()} onOpenFolder={vi.fn()} />)
    const primary = document.querySelector('.start-btn.primary')
    expect(primary?.textContent).toContain('打开知识库文件夹')
    expect(screen.getByText('新建文档')).toBeTruthy()
    expect(screen.getByText('打开文件')).toBeTruthy()
    // 无库时提示样例入口
    expect(screen.getByText(/样例文件/)).toBeTruthy()
  })

  it('有知识库无标签：主要动作是「在此知识库新建」，提示继续最近编辑', () => {
    render(<StartScreen onNew={vi.fn()} onOpen={vi.fn()} onOpenFolder={vi.fn()} hasWorkspace />)
    const primary = document.querySelector('.start-btn.primary')
    expect(primary?.textContent).toContain('在此知识库新建')
    expect(screen.getByText('打开文件')).toBeTruthy()
    expect(screen.getByText('打开其他知识库')).toBeTruthy()
    expect(screen.getByText(/最近编辑/)).toBeTruthy()
    expect(screen.queryByText(/样例文件/)).toBeNull()
  })

  it('不自动渲染任何「登录/同步」类动作（不要求登录）', () => {
    render(<StartScreen onNew={vi.fn()} onOpen={vi.fn()} onOpenFolder={vi.fn()} />)
    expect(document.body.textContent).not.toContain('登录')
    expect(document.body.textContent).not.toContain('同步')
  })
})
