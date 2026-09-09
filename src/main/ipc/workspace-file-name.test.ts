import { describe, expect, it } from 'vitest'
import { safeWorkspaceFileName } from './workspace-file-name'

describe('工作区文件名', () => {
  it('拒绝路径穿越和 Windows 保留名，保留中文 Markdown 文件名', () => {
    expect(safeWorkspaceFileName('../笔记.md')).toBeNull()
    expect(safeWorkspaceFileName('CON.md')).toBeNull()
    expect(safeWorkspaceFileName('  设计.md  ')).toBe('设计.md')
  })
})
