import { describe, expect, it } from 'vitest'
import { DEMO_TREE, DEFAULT_FILE_ID } from './demo-files'

describe('启动示例文件树', () => {
  it('只保留包含欢迎文档的项目文档文件夹', () => {
    expect(DEMO_TREE).toEqual([
      { label: '项目文档', fileIds: ['welcome', 'quickstart', 'design', 'publish'] },
    ])
    expect(DEMO_TREE.some((folder) => folder.fileIds.includes(DEFAULT_FILE_ID))).toBe(true)
  })
})
