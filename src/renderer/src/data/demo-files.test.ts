import { describe, expect, it } from 'vitest'
import { DEMO_TREE, DEFAULT_FILE_ID } from './demo-files'
import { R11_DEMO_FILE_IDS } from '../../../shared/testing/r11-fixture-contract'

describe('启动示例文件树', () => {
  it('R11：示例任务与资料来源文件夹包含核心演示文件', () => {
    expect(DEMO_TREE[0]).toEqual({
      label: '示例任务',
      fileIds: [R11_DEMO_FILE_IDS.welcome, R11_DEMO_FILE_IDS.techNote, R11_DEMO_FILE_IDS.oldNote],
    })
    expect(DEMO_TREE[1]).toEqual({
      label: '资料来源',
      fileIds: [R11_DEMO_FILE_IDS.sourceA, R11_DEMO_FILE_IDS.sourceB],
    })
    expect(DEMO_TREE.some((folder) => folder.fileIds.includes(DEFAULT_FILE_ID))).toBe(true)
  })
})
