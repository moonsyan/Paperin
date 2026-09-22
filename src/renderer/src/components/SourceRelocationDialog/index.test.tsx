// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach } from 'vitest'
import { SourceRelocationCandidateDialog, SourceRelocationDialog } from './index'

afterEach(() => cleanup())

describe('SourceRelocationDialog', () => {
  it('取消时不提交选择', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <SourceRelocationDialog
        open
        previousPath="资料/旧.md"
        selectedPath="资料/新.md"
        selectedModifiedTime={42}
        linkPreviews={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('勾选更新链接后展示替换预览并提交完整选择', () => {
    const onConfirm = vi.fn()
    render(
      <SourceRelocationDialog
        open
        previousPath="资料/旧.md"
        selectedPath="资料/新.md"
        selectedModifiedTime={42}
        linkPreviews={[
          { before: '[x](../资料/旧.md)', after: '[x](../资料/新.md)', start: 0, end: 1 },
        ]}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: '更新当前文档 Markdown 链接' }))
    expect(screen.getByText(/将影响 1 处链接/)).toBeTruthy()
    expect(screen.getByText('[x](../资料/旧.md)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '更新来源基线' }))
    expect(onConfirm).toHaveBeenCalledWith({
      previousPath: '资料/旧.md',
      selectedPath: '资料/新.md',
      selectedModifiedTime: 42,
      updateMarkdownLink: true,
    })
  })
})

describe('SourceRelocationCandidateDialog', () => {
  it('同名多候选需用户点击其一', () => {
    const onSelect = vi.fn()
    render(
      <SourceRelocationCandidateDialog
        open
        previousPath="资料/同名.md"
        candidates={[
          { relativePath: '资料/同名.md', modifiedTime: 1 },
          { relativePath: '归档/同名.md', modifiedTime: 2 },
        ]}
        onSelect={onSelect}
        onSearchInstead={() => {}}
        onCancel={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '归档/同名.md' }))
    expect(onSelect).toHaveBeenCalledWith({ relativePath: '归档/同名.md', modifiedTime: 2 })
  })
})
