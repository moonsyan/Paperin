import { afterEach, describe, expect, it } from 'vitest'
import {
  disposeSharedRegexWorker,
  getCachedSearchLines,
  runSharedRegexSearch,
  cacheSearchLines,
} from './search-regex'

afterEach(() => {
  disposeSharedRegexWorker()
})

describe('工作区正则搜索', () => {
  it('按行返回匹配结果并遵守大小写和数量限制', async () => {
    await expect(
      runSharedRegexSearch('标题\nMarkdown\nmarkdown', 'markdown', false, 1),
    ).resolves.toEqual([{ line: 2, preview: 'Markdown' }])

    await expect(
      runSharedRegexSearch('标题\nMarkdown\nmarkdown', 'markdown', true, 10),
    ).resolves.toEqual([{ line: 3, preview: 'markdown' }])
  })

  it('将非法正则作为稳定错误返回', async () => {
    await expect(runSharedRegexSearch('正文', '[', false, 10)).rejects.toThrow()
  })
})

describe('工作区搜索行缓存', () => {
  it('按路径保存并读取可复用的行数据', () => {
    cacheSearchLines('/tmp/笔记.md', {
      mtimeMs: 100,
      size: 12,
      lines: ['第一行', '第二行'],
    })

    expect(getCachedSearchLines('/tmp/笔记.md')).toMatchObject({
      mtimeMs: 100,
      size: 12,
      lines: ['第一行', '第二行'],
    })
  })
})
