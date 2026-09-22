// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { SKIP_LINK_TARGET_ID } from '../../app/SkipLink'
import { createEmptyWorkspaceIndex } from '../../../../shared/workspace-index'
import { createInitialWorkspaceCoverage, markWorkspaceCoverageIncomplete } from '../../../../shared/workspace-coverage'
import { WorkspaceSearchDialog } from './index'

afterEach(() => cleanup())

beforeEach(() => {
  window.desktopAPI = {
    workspace: { search: vi.fn() },
  } as unknown as Window['desktopAPI']
})

const baseProps = {
  open: true,
  workspacePath: '/tmp/ws',
  workspaceName: '演示库',
  onClose: vi.fn(),
  onSelect: vi.fn(),
}

describe('WorkspaceSearchDialog 键盘与可访问性（R08）', () => {
  it('按 role 与标题名称定位对话框，并具备 aria-modal', () => {
    render(<WorkspaceSearchDialog {...baseProps} />)
    const dialog = screen.getByRole('dialog', { name: /在工作区中搜索/ })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('Tab 不能聚焦到背景动作', () => {
    render(
      <>
        <button type="button">背景保存</button>
        <WorkspaceSearchDialog {...baseProps} />
      </>,
    )
    const searchBtn = screen.getByRole('button', { name: '搜索' })
    searchBtn.focus()
    fireEvent.keyDown(window, { key: 'Tab', bubbles: true })
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '背景保存' }))
  })

  it('compositionstart → Escape → compositionend 不误关', () => {
    const onClose = vi.fn()
    render(<WorkspaceSearchDialog {...baseProps} onClose={onClose} />)
    const input = screen.getByPlaceholderText(/输入关键词/)
    fireEvent.compositionStart(input)
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true, keyCode: 229 })
    fireEvent.compositionEnd(input)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('关闭后触发器已卸载时焦点落到正文宿主', () => {
    const host = document.createElement('div')
    host.id = SKIP_LINK_TARGET_ID
    host.tabIndex = -1
    document.body.append(host)

    function Harness(): JSX.Element {
      const [open, setOpen] = useState(true)
      const [showTrigger, setShowTrigger] = useState(true)
      const handleClose = (): void => {
        setOpen(false)
        setShowTrigger(false)
      }
      return (
        <>
          {showTrigger ? <button type="button">打开搜索</button> : null}
          <WorkspaceSearchDialog {...baseProps} open={open} onClose={handleClose} />
        </>
      )
    }
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).toBe(host)
  })
})

describe('WorkspaceSearchDialog 覆盖与空结果', () => {
  it('索引未完成且空命中时不显示确定无匹配', async () => {
    const coverage = createInitialWorkspaceCoverage()
    markWorkspaceCoverageIncomplete(coverage)
    coverage.skipped['file-budget'] = 3
    window.desktopAPI = {
      workspace: {
        search: vi.fn(async () => ({
          ok: true,
          data: {
            matches: [],
            coverage,
            truncated: true,
            scanTruncated: true,
            matchCapped: false,
          },
        })),
      },
    } as unknown as Window['desktopAPI']

    render(<WorkspaceSearchDialog {...baseProps} />)
    fireEvent.change(screen.getByLabelText('工作区搜索关键词'), { target: { value: 'missing' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    expect(await screen.findByText(/没有扫完整个知识库/)).toBeTruthy()
    expect(screen.queryByText('无匹配结果')).toBeNull()
    expect(screen.getByText(/文件数量预算/)).toBeTruthy()
  })

  it('命中 200 条上限与未扫完可同时提示', async () => {
    const coverage = createInitialWorkspaceCoverage()
    markWorkspaceCoverageIncomplete(coverage)
    coverage.matchCapped = true
    coverage.skipped['file-size'] = 1
    const matches = Array.from({ length: 200 }, (_, index) => ({
      path: `/tmp/ws/doc-${index}.md`,
      line: 1,
      preview: 'hit',
    }))
    window.desktopAPI = {
      workspace: {
        search: vi.fn(async () => ({
          ok: true,
          data: {
            matches,
            coverage,
            truncated: true,
            scanTruncated: true,
            matchCapped: true,
          },
        })),
      },
    } as unknown as Window['desktopAPI']

    render(<WorkspaceSearchDialog {...baseProps} />)
    fireEvent.change(screen.getByLabelText('工作区搜索关键词'), { target: { value: 'hit' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))

    expect(await screen.findByText(/200 条上限/)).toBeTruthy()
    expect(screen.getByText(/没有扫完整个知识库/)).toBeTruthy()
  })

  it('索引建立中显示状态且不阻断搜索', () => {
    const index = createEmptyWorkspaceIndex('/tmp/ws')
    index.complete = false
    index.coverage = createInitialWorkspaceCoverage()
    markWorkspaceCoverageIncomplete(index.coverage)
    index.coverage.skipped['file-budget'] = 1

    render(<WorkspaceSearchDialog {...baseProps} workspaceIndex={index} />)
    expect(screen.getByText(/正在建立索引/)).toBeTruthy()
  })
})

describe('WorkspaceSearchDialog 失败与取消可采取行动', () => {
  it('搜索失败时显示错误且可关闭，不误报命中', async () => {
    const onClose = vi.fn()
    window.desktopAPI = {
      workspace: {
        search: vi.fn(async () => ({
          ok: false,
          error: { code: 'INVALID_REGEX', message: '正则表达式不合法，请检查后重试' },
        })),
      },
    } as unknown as Window['desktopAPI']
    render(<WorkspaceSearchDialog {...baseProps} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('工作区搜索关键词'), { target: { value: '(unclosed' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('正则表达式不合法，请检查后重试')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /插入引用/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalled()
  })
})
