import { describe, expect, it } from 'vitest'
import { resolveRestoredActiveFileId } from './restore-target'

describe('resolveRestoredActiveFileId', () => {
  it('恢复存在的上次活动标签', () => {
    expect(resolveRestoredActiveFileId('notes.md', new Set(['welcome', 'notes.md']), 'welcome'))
      .toBe('notes.md')
  })

  it('恢复目标缺失时回退到默认标签', () => {
    expect(resolveRestoredActiveFileId('missing.md', new Set(['welcome']), 'welcome'))
      .toBe('welcome')
  })
})
