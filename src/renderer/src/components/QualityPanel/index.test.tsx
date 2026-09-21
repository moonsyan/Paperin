// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QualityPanel } from './index'

describe('QualityPanel 来源健康', () => {
  it('显示来源已变化、来源缺失和索引未完成，缺失时只提供重新定位和打开搜索', () => {
    const onRelocateSource = vi.fn()
    const onOpenWorkspaceSearch = vi.fn()
    render(
      <QualityPanel
        diagnostics={[]}
        indexComplete
        sourceHealth={[
          { path: '资料/current.md', status: 'current' },
          { path: '资料/changed.md', status: 'changed' },
          { path: '资料/missing.md', status: 'missing' },
          { path: '资料/pending.md', status: 'unverified' },
        ]}
        onRelocateSource={onRelocateSource}
        onOpenWorkspaceSearch={onOpenWorkspaceSearch}
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
})
