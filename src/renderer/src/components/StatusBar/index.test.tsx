// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StatusBar } from './index'

afterEach(() => {
  cleanup()
})

describe('StatusBar', () => {
  it('渲染已保存态与统计信息', () => {
    render(
      <StatusBar
        saved
        wordCount={120}
        lineCount={10}
        readTime={1}
        cursorLine={3}
        cursorCol={7}
        encoding="UTF-8"
      />,
    )
    expect(screen.getByText('已保存')).not.toBeNull()
    expect(screen.getByText('行 3, 列 7')).not.toBeNull()
    expect(screen.getByText('120 字')).not.toBeNull()
    expect(screen.getByText('10 行')).not.toBeNull()
    expect(screen.getByText('UTF-8')).not.toBeNull()
    expect(screen.queryByText(/已选中/)).toBeNull()
  })

  it('未保存态显示提示；BOM 编码显示别名', () => {
    render(
      <StatusBar
        saved={false}
        wordCount={0}
        lineCount={1}
        readTime={0}
        encoding="UTF-8-BOM"
      />,
    )
    expect(screen.getByText('未保存')).not.toBeNull()
    expect(screen.getByText('UTF-8 (BOM)')).not.toBeNull()
  })

  it('示例与未命名文档没有磁盘路径时不显示已保存', () => {
    const { rerender } = render(<StatusBar saved storageKind="unnamed" wordCount={0} lineCount={1} readTime={0} />)
    expect(screen.getByText('尚未保存到磁盘')).toBeTruthy()
    expect(screen.queryByText('已保存')).toBeNull()
    rerender(<StatusBar saved storageKind="demo" wordCount={0} lineCount={1} readTime={0} />)
    expect(screen.getByText('示例文档')).toBeTruthy()
    rerender(<StatusBar saved={false} storageKind="demo" wordCount={0} lineCount={1} readTime={0} />)
    expect(screen.getByText('示例 · 有未保存修改')).toBeTruthy()
  })

  it('有选区时显示选中字数；标题与修改时间可选展示', () => {
    render(
      <StatusBar
        saved
        wordCount={5}
        lineCount={1}
        readTime={0}
        currentHeading="第一章"
        modifiedTime={new Date('2026-08-26T10:00:00').getTime()}
        selectedChars={9}
      />,
    )
    expect(screen.getByText('第一章')).not.toBeNull()
    expect(screen.getByText('已选中 9 字')).not.toBeNull()
    expect(screen.getByText(/修改于 2026-08-26/)).not.toBeNull()
  })

  it('显示光标所在章节字数与目标进度', () => {
    render(
      <StatusBar
        saved
        wordCount={500}
        lineCount={10}
        readTime={1}
        sectionWords={120}
        goalWords={500}
        goalPercent={50}
      />,
    )
    expect(screen.getByText('本章 120 字')).not.toBeNull()
    expect(screen.getByText('目标 50%')).not.toBeNull()
  })

  it('未设置目标时显示低调入口，保存输入后回调覆盖值', () => {
    const onGoalChange = vi.fn()
    render(
      <StatusBar
        saved
        wordCount={0}
        lineCount={1}
        readTime={0}
        goalWords={null}
        goalPercent={null}
        onGoalChange={onGoalChange}
      />,
    )
    fireEvent.click(screen.getByText('设置目标'))
    const input = screen.getByLabelText('本文档目标字数') as HTMLInputElement
    fireEvent.change(input, { target: { value: '5000' } })
    fireEvent.click(screen.getByText('保存'))
    expect(onGoalChange).toHaveBeenCalledWith(5000)
  })

  it('Enter 保存目标，Escape 仅关闭不改动', () => {
    const onGoalChange = vi.fn()
    render(
      <StatusBar
        saved
        wordCount={0}
        lineCount={1}
        readTime={0}
        goalWords={null}
        goalPercent={null}
        onGoalChange={onGoalChange}
      />,
    )
    fireEvent.click(screen.getByText('设置目标'))
    const input = screen.getByLabelText('本文档目标字数') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2000' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onGoalChange).toHaveBeenCalledWith(2000)

    fireEvent.click(screen.getByText('设置目标'))
    fireEvent.keyDown(screen.getByLabelText('本文档目标字数'), { key: 'Escape' })
    expect(onGoalChange).toHaveBeenCalledTimes(1)
  })

  it('保存中和失败状态优先于已保存文案', () => {
    const { rerender } = render(<StatusBar saved wordCount={0} lineCount={1} readTime={0} saveActivity="saving" />)
    expect(screen.getByText('正在保存…')).toBeTruthy()
    rerender(<StatusBar saved={false} wordCount={0} lineCount={1} readTime={0} saveActivity="failed" />)
    expect(screen.getByText('保存失败，编辑内容仍保留')).toBeTruthy()
  })

  it('输入法组合态中的 Escape 不关闭字数目标', () => {
    render(
      <StatusBar
        saved
        wordCount={0}
        lineCount={1}
        readTime={0}
        goalWords={null}
        goalPercent={null}
        onGoalChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('设置目标'))
    const input = screen.getByLabelText('本文档目标字数')
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    expect(screen.getByLabelText('本文档目标字数')).toBeTruthy()
  })

  it('“跟随全局”移除本文档覆盖', () => {
    const onGoalChange = vi.fn()
    render(
      <StatusBar
        saved
        wordCount={0}
        lineCount={1}
        readTime={0}
        goalWords={1000}
        goalPercent={10}
        onGoalChange={onGoalChange}
      />,
    )
    fireEvent.click(screen.getByText(/目标 10%/))
    fireEvent.click(screen.getByText('跟随全局'))
    expect(onGoalChange).toHaveBeenCalledWith(undefined)
  })

  it('无目标且未提供 onGoalChange 时不渲染目标项', () => {
    render(<StatusBar saved wordCount={0} lineCount={1} readTime={0} />)
    expect(screen.queryByText(/目标/)).toBeNull()
  })
})
