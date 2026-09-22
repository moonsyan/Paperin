import { describe, expect, it, vi } from 'vitest'
import { insertCitationFromPanel } from './insert-citation'

describe('insertCitationFromPanel', () => {
  it('把来源快照插入当前文章，不要求打开来源', () => {
    const insertMd = vi.fn()
    const notify = vi.fn()
    expect(
      insertCitationFromPanel({
        editor: { insertMd },
        activeFileId: 'current',
        fromFile: 'D:/笔记/今天/文章.md',
        toFile: 'D:/笔记/资料/文章.md',
        preview: '旧段落',
        notify,
      }),
    ).toBe(true)
    expect(insertMd).toHaveBeenCalledTimes(1)
    expect(String(insertMd.mock.calls[0][0])).toContain('> 旧段落')
    expect(notify).toHaveBeenCalledWith('已插入来源引用，可用撤销收回')
  })

  it('没有活动文档时不插入', () => {
    const insertMd = vi.fn()
    expect(
      insertCitationFromPanel({
        editor: { insertMd },
        activeFileId: '',
        fromFile: null,
        toFile: 'D:/笔记/资料/文章.md',
        preview: '片段',
        notify: () => {},
      }),
    ).toBe(false)
    expect(insertMd).not.toHaveBeenCalled()
  })

  it('编辑器未就绪时不插入且返回 false', () => {
    const notify = vi.fn()
    expect(
      insertCitationFromPanel({
        editor: null,
        activeFileId: 'current',
        fromFile: null,
        toFile: 'D:/笔记/资料/文章.md',
        preview: '片段',
        notify,
      }),
    ).toBe(false)
    expect(notify).toHaveBeenCalledWith('编辑器尚未就绪，未插入引用')
  })
})
