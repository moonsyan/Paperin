import { describe, expect, it } from 'vitest'
import {
  restoreFullRangeOverride,
  setFullRangeOverride,
} from './editorViewport'

describe('restoreFullRangeOverride', () => {
  it('已启用的导出全量视口只恢复一次', () => {
    setFullRangeOverride(true)

    expect(restoreFullRangeOverride()).toBe(true)
    expect(restoreFullRangeOverride()).toBe(false)
  })
})
