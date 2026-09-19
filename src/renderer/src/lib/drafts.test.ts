import { describe, expect, it } from 'vitest'
import { sha256Text, shouldApplyDraftOverDisk } from './drafts'

describe('草稿是否盖过磁盘', () => {
  it('记下的基线哈希与当前磁盘不一致时放弃草稿', async () => {
    const baseline = '打开时的正文'
    const disk = '外部编辑器改过、mtime 没变'
    expect(await shouldApplyDraftOverDisk({
      draftContent: '未保存的编辑',
      diskContent: disk,
      baselineSha256: await sha256Text(baseline),
      savedAt: 200,
      diskMtime: 100,
      readMtime: 100,
    })).toBe(false)
  })

  it('磁盘仍是起草时的基线则恢复草稿', async () => {
    const baseline = '打开时的正文'
    expect(await shouldApplyDraftOverDisk({
      draftContent: '未保存的编辑',
      diskContent: baseline,
      baselineSha256: await sha256Text(baseline),
      savedAt: 200,
      diskMtime: 100,
      readMtime: 100,
    })).toBe(true)
  })

  it('没有基线哈希的旧草稿仍按 mtime 放弃更新的磁盘', async () => {
    expect(await shouldApplyDraftOverDisk({
      draftContent: '旧草稿',
      diskContent: '磁盘更新',
      savedAt: 100,
      diskMtime: 500,
      readMtime: 500,
    })).toBe(false)
  })
})
