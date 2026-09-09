// @vitest-environment jsdom
/* ==================== OutlinePanel 折叠态回归测试 ====================
 *
 * 背景：折叠态以标题顺序 idx 为键，组件在侧栏中常驻不卸载。
 * 若切文档不清空，旧文档的折叠键会错配到新文档同序号标题（同序号标题被
 * 错误地折叠/展开）。本文件验证：同一文档内折叠态持久，切换 docKey 后重置。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { OutlinePanel } from './OutlinePanel'

const DOC = '# H1\n## Sub A\n## Sub B\n# H2\n'

afterEach(cleanup)

describe('OutlinePanel 跨文档折叠态重置', () => {
  it('同一文档内折叠态保持，切换文档后重置', () => {
    const { rerender } = render(
      <OutlinePanel content={DOC} docKey="file-a" activeOutlineIndex={-1} onOutlineClick={() => {}} />,
    )

    // 初始：H1 展开，子标题可见
    expect(screen.queryByText('Sub A')).not.toBeNull()

    // 折叠 H1（点击其折叠箭头）
    const h1Row = screen.getByText('H1').closest('button') as HTMLElement
    const caret = h1Row.querySelector('.outline-caret:not(.outline-caret-empty)') as HTMLElement
    expect(caret).not.toBeNull()
    fireEvent.click(caret)

    // 折叠后：子标题不再渲染
    expect(screen.queryByText('Sub A')).toBeNull()

    // 同一文档（docKey 不变）重新渲染：折叠态仍保持
    rerender(
      <OutlinePanel content={DOC} docKey="file-a" activeOutlineIndex={-1} onOutlineClick={() => {}} />,
    )
    expect(screen.queryByText('Sub A')).toBeNull()

    // 切换到另一文档（docKey 变化）：折叠态重置，子标题重新可见
    rerender(
      <OutlinePanel content={DOC} docKey="file-b" activeOutlineIndex={-1} onOutlineClick={() => {}} />,
    )
    expect(screen.queryByText('Sub A')).not.toBeNull()
  })
})

describe('OutlinePanel 章节字数', () => {
  it('大纲每项显示章节字数，父节累计包含子节', () => {
    render(
      <OutlinePanel
        content={'# 章一\n\n内容文字。\n## 小节\n\n小节内容。'}
        docKey="file-a"
        activeOutlineIndex={-1}
        onOutlineClick={() => {}}
      />,
    )
    // 小节：标题 2 + 正文 5 = 7；章一：标题 2 + 正文 5 + 小节 7 = 14
    expect(screen.getByText('7 字')).not.toBeNull()
    expect(screen.getByText('14 字')).not.toBeNull()
  })

  it('无标题文档不渲染大纲行，显示空态', () => {
    render(
      <OutlinePanel content="没有标题的正文" docKey="file-a" activeOutlineIndex={-1} onOutlineClick={() => {}} />,
    )
    expect(screen.getByText('暂无标题')).not.toBeNull()
    expect(screen.queryByText(/字$/)).toBeNull()
  })
})
