// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Workbench } from './Workbench'

afterEach(cleanup)

describe('柔和工作台原型的用户流程', () => {
  it('默认突出当前正文，辅助面板不抢占空间', () => {
    render(<Workbench />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('让笔记成为下一次思考的起点')
    expect(screen.queryByRole('complementary', { name: '文档辅助' })).toBeNull()
    expect(screen.getByText('演示空间 · 修改仅本次保留')).toBeTruthy()
  })

  it('标签支持箭头切换和 Home 返回，焦点随活动标签移动', () => {
    render(<Workbench />)
    fireEvent.keyDown(screen.getByRole('tab', { name: '让笔记成为下一次思考的起点' }), { key: 'ArrowRight' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('九月阅读计划')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '九月阅读计划' }))
    fireEvent.keyDown(document.activeElement || window, { key: 'Home' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('让笔记成为下一次思考的起点')
  })

  it('搜索自动聚焦输入框，Tab 在弹窗内循环', () => {
    render(<Workbench />)
    fireEvent.click(screen.getByRole('button', { name: '搜索文档' }))
    expect(document.activeElement).toBe(screen.getByRole('searchbox'))
    const close = screen.getByRole('button', { name: '关闭弹窗' })
    close.focus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement?.className).toBe('search-result')
  })

  it('窄窗口导航与辅助互斥，关闭后解除正文 inert', () => {
    const originalWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 })
    try {
      render(<Workbench />)
      expect(screen.queryByRole('complementary', { name: '知识库导航' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: '展开导航' }))
      expect(screen.getByLabelText('写作工作台').hasAttribute('inert')).toBe(true)
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.getByLabelText('写作工作台').hasAttribute('inert')).toBe(false)
      fireEvent.click(screen.getByRole('button', { name: '打开文档辅助' }))
      expect(screen.queryByRole('complementary', { name: '知识库导航' })).toBeNull()
      expect(screen.getByRole('complementary', { name: '文档辅助' })).toBeTruthy()
    } finally {
      cleanup()
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
    }
  })

  it('搜索中文内容并打开结果，标签、路径与标题同步', () => {
    render(<Workbench />)
    fireEvent.click(screen.getByRole('button', { name: '搜索文档' }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '散步' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /散步时想到的事/ }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('散步时想到的事')
    expect(screen.getByRole('tab', { name: '散步时想到的事' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByLabelText('当前文档路径').textContent).toContain('随笔 / 散步时想到的事.md')
  })

  it('无搜索结果提供明确空态，Escape 关闭并恢复焦点', () => {
    render(<Workbench />)
    const trigger = screen.getByRole('button', { name: '搜索文档' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '不存在xyz' } })
    expect(screen.getByText('没有找到匹配的笔记')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('输入法组合态 Escape 不关闭搜索', () => {
    render(<Workbench />)
    fireEvent.click(screen.getByRole('button', { name: '搜索文档' }))
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape', isComposing: true })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('关联跳转沿用文档上下文，AI 示例清楚说明能力边界', () => {
    render(<Workbench />)
    fireEvent.click(screen.getByRole('button', { name: '打开文档辅助' }))
    fireEvent.click(screen.getByRole('button', { name: '关联' }))
    fireEvent.click(within(screen.getByLabelText('文档辅助')).getByRole('button', { name: /卡片笔记法/ }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('卡片笔记法：用自己的话重述')
    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    expect(screen.getByText('交互示例，未连接模型；不会发送任何内容。')).toBeTruthy()
  })

  it('编辑演示草稿后切换文件仍保留内容，并标记为本次修改', () => {
    render(<Workbench />)
    fireEvent.click(screen.getByRole('button', { name: '编辑演示文档' }))
    fireEvent.change(screen.getByRole('textbox', { name: '演示正文' }), { target: { value: '# 新标题\n\n中文草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '完成编辑' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('新标题')
    expect(screen.getByRole('tab', { name: /本次有修改/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '九月阅读计划' }))
    fireEvent.click(screen.getByRole('tab', { name: /让笔记成为下一次思考的起点/ }))
    expect(screen.getByText('中文草稿')).toBeTruthy()
  })

  it('专注后可用 Escape 退出，恢复原有辅助面板', () => {
    render(<Workbench />)
    fireEvent.click(screen.getByRole('button', { name: '打开文档辅助' }))
    fireEvent.click(screen.getByRole('button', { name: '专注' }))
    expect(screen.queryByRole('complementary', { name: '文档辅助' })).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByRole('complementary', { name: '文档辅助' })).toBeTruthy()
  })

  it('新建演示笔记可编辑，收藏过滤与取消收藏更新结果', () => {
    render(<Workbench />)
    fireEvent.click(screen.getByRole('button', { name: '新建演示笔记' }))
    expect(screen.getByRole('textbox', { name: '演示正文' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '完成编辑' }))
    fireEvent.click(screen.getByRole('button', { name: '收藏文档' }))
    fireEvent.click(screen.getByRole('button', { name: '我的收藏' }))
    expect(within(screen.getByLabelText('笔记列表')).getByRole('button', { name: '未命名笔记 1' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消收藏' }))
    expect(within(screen.getByLabelText('笔记列表')).queryByRole('button', { name: '未命名笔记 1' })).toBeNull()
  })
})
