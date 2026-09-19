import { describe, expect, it } from 'vitest'
import { workspaceCompatibilityNotes, workspaceCompatibilityToast } from './workspace-compatibility'

describe('workspaceCompatibilityNotes', () => {
  it('完整且没有诊断时不提示', () => {
    expect(workspaceCompatibilityNotes({ complete: true, truncated: false, diagnostics: [] })).toEqual([])
    expect(workspaceCompatibilityNotes(null)).toEqual([])
    expect(workspaceCompatibilityToast([])).toBeNull()
  })

  it('未扫完、缺附件和断链分开说明，且不改写任何正文', () => {
    const notes = workspaceCompatibilityNotes({
      complete: false,
      truncated: true,
      diagnostics: [
        { code: 'MISSING_ASSET' },
        { code: 'MISSING_ASSET' },
        { code: 'BROKEN_LINK' },
        { code: 'FOOTNOTE_ERROR' },
      ],
    })
    expect(notes[0]).toContain('不能当成完整结果')
    expect(notes[1]).toContain('2 个附件')
    expect(notes[1]).toContain('不会被改写')
    expect(workspaceCompatibilityToast(notes)).toContain('原文没有被修改')
  })
})
