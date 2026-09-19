import { describe, expect, it, vi } from 'vitest'
import { appendExportReminder, readExportSource, reviewExportMarkdown } from './review-export'

describe('reviewExportMarkdown', () => {
  it('空图片会阻止，且不调用确认', async () => {
    const confirm = vi.fn(() => true)
    const notify = vi.fn()
    const result = await reviewExportMarkdown({
      content: '正文\n![]()',
      directory: 'D:/notes',
      stat: async () => ({ ok: true }),
      notify,
      confirm,
    })
    expect(result.ok).toBe(false)
    expect(notify).toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('本地图片缺失时取消则不通过，原文由调用方保留', async () => {
    const source = '![图](missing.png)\n- [ ] 待办'
    const result = await reviewExportMarkdown({
      content: source,
      directory: 'D:/notes',
      stat: async () => ({ ok: false }),
      notify: () => {},
      confirm: () => false,
    })
    expect(result).toEqual({ ok: false })
    expect(source).toContain('- [ ] 待办')
  })

  it('确认后继续，并把未完成任务留在提醒里', async () => {
    const result = await reviewExportMarkdown({
      content: '![图](missing.png)\n- [ ] 待办',
      directory: 'D:/notes',
      stat: async () => ({ ok: false }),
      notify: () => {},
      confirm: () => true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.reminder).toContain('未完成任务')
  })

  it('没有目录时不查磁盘，外链不拦截', async () => {
    const stat = vi.fn(async () => ({ ok: false }))
    const result = await reviewExportMarkdown({
      content: '![网图](https://example.com/a.png)',
      directory: undefined,
      stat,
      notify: () => {},
      confirm: () => false,
    })
    expect(result).toEqual({ ok: true, reminder: null })
    expect(stat).not.toHaveBeenCalled()
  })
})

describe('readExportSource', () => {
  it('编辑器未就绪时使用已有正文', () => {
    expect(readExportSource({
      editorMarkdown: null,
      fallback: '已有',
      directory: 'D:/notes',
    })).toBe('已有')
  })
})

describe('appendExportReminder', () => {
  it('没有提醒时不改成功文案', () => {
    expect(appendExportReminder('HTML 已导出', null)).toBe('HTML 已导出')
    expect(appendExportReminder('HTML 已导出', '还有 1 个未完成任务')).toContain('未完成任务')
  })
})
