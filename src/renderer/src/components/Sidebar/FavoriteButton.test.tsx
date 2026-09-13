// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FavoriteButton } from './FavoriteButton'

afterEach(cleanup)
it('星标点击、双击、键盘事件不传播到文件打开行', () => {
  const onOpen = vi.fn(), onToggle = vi.fn()
  render(<div onClick={onOpen} onDoubleClick={onOpen} onKeyDown={onOpen}>
    <FavoriteButton name="笔记.md" path="/notes/笔记.md" favorite={false} onToggle={onToggle} />
  </div>)
  const button = screen.getByRole('button', { name: '收藏 笔记.md' })
  button.focus()
  fireEvent.keyDown(button, { key: 'Enter' })
  fireEvent.click(button)
  fireEvent.doubleClick(button)
  expect(onOpen).not.toHaveBeenCalled()
  expect(onToggle).toHaveBeenCalledWith('/notes/笔记.md')
  expect(button.getAttribute('aria-pressed')).toBe('false')
})
