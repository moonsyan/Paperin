// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusBar } from './index'
import { createDefaultPanelRegistry, createPanelRegistry } from '../../app/panels/panel-registry'

afterEach(cleanup)

const baseProps = {
  saved: true,
  wordCount: 1234,
  lineCount: 56,
  readTime: 4,
}

describe('StatusBar statusbar.end 插槽消费', () => {
  it('默认注册表：内置条目按注册顺序渲染', () => {
    const { container } = render(<StatusBar {...baseProps} registry={createDefaultPanelRegistry()} />)
    const text = container.textContent ?? ''
    const wordsAt = text.indexOf('1234 字')
    const linesAt = text.indexOf('56 行')
    const readAt = text.indexOf('约 4 分钟')
    const encodingAt = text.indexOf('UTF-8')
    const languageAt = text.indexOf('Markdown')
    expect(wordsAt).toBeGreaterThan(-1)
    expect(wordsAt).toBeLessThan(linesAt)
    expect(linesAt).toBeLessThan(readAt)
    expect(readAt).toBeLessThan(encodingAt)
    expect(encodingAt).toBeLessThan(languageAt)
  })

  it('注册表为空时不渲染任何 statusbar.end 条目', () => {
    render(<StatusBar {...baseProps} registry={createPanelRegistry()} />)
    expect(screen.queryByText('1234 字')).toBeNull()
    expect(screen.queryByText('Markdown')).toBeNull()
    // 左侧保存状态不受插槽影响
    expect(screen.getByText('已保存')).toBeTruthy()
  })

  it('扩展面板经 render(context) 追加到状态栏末尾', () => {
    const registry = createDefaultPanelRegistry()
    registry.register({
      id: 'status.custom',
      slot: 'statusbar.end',
      title: '自定义',
      order: 200,
      render: () => <span>自定义条目</span>,
    })
    render(<StatusBar {...baseProps} registry={registry} />)
    expect(screen.getByText('自定义条目')).toBeTruthy()
  })

  it('覆盖注册可替换内置条目顺序', () => {
    const registry = createPanelRegistry()
    registry.register({ id: 'status.language', slot: 'statusbar.end', title: '语言', order: 1 })
    registry.register({ id: 'status.words', slot: 'statusbar.end', title: '字数', order: 2 })
    const { container } = render(<StatusBar {...baseProps} registry={registry} />)
    const text = container.textContent ?? ''
    expect(text.indexOf('Markdown')).toBeLessThan(text.indexOf('1234 字'))
    // 未注册的条目不出现
    expect(screen.queryByText('56 行')).toBeNull()
  })
})
