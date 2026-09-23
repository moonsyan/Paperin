import { describe, expect, it, vi } from 'vitest'
import {
  appendExportReminder,
  directoryOfAbsolutePath,
  readExportSource,
  reviewExportMarkdown,
  reviewExportMarkdownDocuments,
} from './review-export'

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

describe('reviewExportMarkdownDocuments', () => {
  it('多篇缺图只弹一次确认，取消则整批不通过', async () => {
    const confirm = vi.fn(() => false)
    const notify = vi.fn()
    const result = await reviewExportMarkdownDocuments({
      documents: [
        { content: '![a](a.png)', directory: 'D:/notes/sub', label: '甲' },
        { content: '![b](b.png)', directory: 'D:/notes/other', label: '乙' },
      ],
      stat: async () => ({ ok: false }),
      notify,
      confirm,
    })
    expect(result.ok).toBe(false)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0]?.[0]).toContain('甲')
    expect(confirm.mock.calls[0]?.[0]).toContain('乙')
  })

  it('mdimg 目标不参与缺附件 stat（需先 toStoredImages）', async () => {
    const stat = vi.fn(async () => ({ ok: false }))
    const result = await reviewExportMarkdownDocuments({
      documents: [
        {
          content: '![图](mdimg://D%3A%2Fnotes%2Fassets%2Fa.png)',
          directory: 'D:/notes',
          label: '演示',
        },
      ],
      stat,
      notify: () => {},
      confirm: () => false,
    })
    expect(result.ok).toBe(true)
    expect(stat).not.toHaveBeenCalled()
  })
})

describe('directoryOfAbsolutePath', () => {
  it('从绝对路径取文档目录', () => {
    expect(directoryOfAbsolutePath('D:/notes/sub/a.md')).toBe('D:/notes/sub')
    expect(directoryOfAbsolutePath('a.md')).toBeUndefined()
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
