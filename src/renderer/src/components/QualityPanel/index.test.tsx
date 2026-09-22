// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QualityPanel } from './index'

afterEach(() => {
  cleanup()
})

describe('QualityPanel 来源健康', () => {
  it('显示来源已变化、来源缺失和索引未完成，缺失时只提供重新定位和打开搜索', () => {
    const onRelocateSource = vi.fn()
    const onOpenWorkspaceSearch = vi.fn()
    render(
      <QualityPanel
        diagnostics={[]}
        indexComplete
        sourceHealth={[
          { path: '资料/current.md', status: 'current', scope: 'current-document' },
          { path: '资料/changed.md', status: 'changed', scope: 'current-document' },
          { path: '资料/missing.md', status: 'missing', scope: 'current-document' },
          { path: '资料/pending.md', status: 'unverified', scope: 'current-document' },
        ]}
        onRelocateSource={onRelocateSource}
        onOpenWorkspaceSearch={onOpenWorkspaceSearch}
        onReviewCurrentDocumentSources={vi.fn()}
      />,
    )
    expect(screen.getByText('来源已变化')).toBeTruthy()
    expect(screen.getByText('来源缺失')).toBeTruthy()
    expect(screen.getAllByText('索引未完成')).toHaveLength(1)
    expect(screen.queryByText('资料/current.md')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重新定位' }))
    expect(onRelocateSource).toHaveBeenCalledWith('资料/missing.md')
    fireEvent.click(screen.getByRole('button', { name: '打开搜索' }))
    expect(onOpenWorkspaceSearch).toHaveBeenCalledOnce()
  })

  it('legacy 记录单独展示且复核按钮只更新当前文章', () => {
    const onReview = vi.fn()
    render(
      <QualityPanel
        diagnostics={[]}
        indexComplete
        legacySourceCount={1}
        sourceHealth={[
          { path: '资料/current.md', status: 'current', scope: 'current-document' },
          { path: '资料/legacy.md', status: 'changed', scope: 'legacy-unknown' },
        ]}
        onReviewCurrentDocumentSources={onReview}
      />,
    )
    expect(screen.getByText(/归属未知/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '复核当前文章' }))
    expect(onReview).toHaveBeenCalledOnce()
  })
})
