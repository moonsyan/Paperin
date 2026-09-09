// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { VersionHistoryDialog } from './index'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SNAP_NEW = '# 标题\n新内容\n结尾'
const SNAP_OLD = '# 标题\n旧内容\n结尾'
const CURRENT = '# 标题\n改过的内容\n结尾'

/** 模拟主进程版本历史：两份快照（新在前） */
const stubHistory = () => {
  const api = {
    platform: 'win32',
    history: {
      list: vi.fn(async () => ({
        ok: true,
        data: { snapshots: [{ t: 200, size: SNAP_NEW.length }, { t: 100, size: SNAP_OLD.length }] },
      })),
      read: vi.fn(async (_path: string, t: number) => ({
        ok: true,
        data: { content: t === 200 ? SNAP_NEW : SNAP_OLD },
      })),
      record: vi.fn(async () => ({ ok: true, data: undefined })),
    },
  }
  vi.stubGlobal('desktopAPI', api)
  return api
}

describe('VersionHistoryDialog 对比视图', () => {
  it('默认全文预览；切换「对比当前」显示增删行与统计', async () => {
    stubHistory()
    render(
      <VersionHistoryDialog
        open
        filePath="D:/笔记/a.md"
        docName="a.md"
        currentContent={CURRENT}
        onClose={vi.fn()}
        onRestore={vi.fn()}
      />,
    )
    // 选择最新快照（列表第一项）
    fireEvent.click((await screen.findAllByRole('option'))[0])
    await screen.findByText(/新内容/)
    expect(screen.queryByText('+')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '对比当前' }))
    // 快照 vs 当前编辑器：旧"新内容"删除，新"改过的内容"新增
    expect(screen.getByText('−')).not.toBeNull()
    expect(screen.getAllByText('+').length).toBeGreaterThan(0)
    expect(screen.getByText(/改过的内容/)).not.toBeNull()
    expect(screen.getByText(/^−1/)).not.toBeNull()
  })

  it('「对比上一版」懒加载更早快照并按 del+add 展示', async () => {
    const api = stubHistory()
    render(
      <VersionHistoryDialog
        open
        filePath="D:/笔记/a.md"
        docName="a.md"
        currentContent=""
        onClose={vi.fn()}
        onRestore={vi.fn()}
      />,
    )
    fireEvent.click((await screen.findAllByRole('option'))[0])
    await screen.findByText(/新内容/)

    fireEvent.click(screen.getByRole('tab', { name: '对比上一版' }))
    await screen.findByText(/旧内容/)
    expect(api.history.read).toHaveBeenCalledWith('D:/笔记/a.md', 100)
    // 上一版(旧)→选中快照(新)：仅中间一行变化
    expect(typesIn(document.body)).toContain('del')
    expect(typesIn(document.body)).toContain('add')
  })

  it('只有一份快照时「对比上一版」禁用', async () => {
    const api = stubHistory()
    api.history.list = vi.fn(async () => ({
      ok: true,
      data: { snapshots: [{ t: 200, size: 10 }] },
    }))
    render(
      <VersionHistoryDialog
        open
        filePath="D:/笔记/a.md"
        docName="a.md"
        onClose={vi.fn()}
        onRestore={vi.fn()}
      />,
    )
    fireEvent.click(await screen.findByRole('option'))
    await screen.findByText(/新内容/)
    expect(
      (screen.getByRole('tab', { name: '对比上一版' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

const typesIn = (root: HTMLElement): string =>
  Array.from(root.querySelectorAll('.diff-row')).map((r) => r.className).join(',')
