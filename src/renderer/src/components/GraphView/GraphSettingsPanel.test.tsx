// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GraphSettingsPanel } from './GraphSettingsPanel'
import { DEFAULT_GRAPH_SETTINGS } from './graph-settings'

afterEach(cleanup)

describe('GraphSettingsPanel', () => {
  it('保留设置项的语义、当前值和精确更新合同', () => {
    const onSettingChange = vi.fn()
    render(
      <GraphSettingsPanel
        open
        settings={DEFAULT_GRAPH_SETTINGS}
        onSettingChange={onSettingChange}
      />,
    )

    expect(screen.getByLabelText('图谱设置').classList.contains('open')).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('搜索笔记 / 路径…'), {
      target: { value: 'alpha' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: '箭头' }))
    fireEvent.change(screen.getByRole('slider', { name: /^节点大小/ }), {
      target: { value: '1.5' },
    })

    expect(onSettingChange).toHaveBeenNthCalledWith(1, 'search', 'alpha')
    expect(onSettingChange).toHaveBeenNthCalledWith(2, 'arrows', true)
    expect(onSettingChange).toHaveBeenNthCalledWith(3, 'nodeSize', 1.5)
  })
})
