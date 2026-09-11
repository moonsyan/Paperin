/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { redoCommand, undoCommand } from '@milkdown/kit/plugin/history'
import {
  createCodeBlockCommand,
  toggleEmphasisCommand,
  toggleStrongCommand,
} from '@milkdown/kit/preset/commonmark'
import { toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { runEditorCommand } from './editor-commands'
import type { EditorCommand } from './editor-adapter'

const cases: { command: EditorCommand; key: unknown; label: string }[] = [
  { command: 'undo', key: undoCommand.key, label: '撤销' },
  { command: 'redo', key: redoCommand.key, label: '重做' },
  { command: 'bold', key: toggleStrongCommand.key, label: '加粗' },
  { command: 'italic', key: toggleEmphasisCommand.key, label: '斜体' },
  { command: 'strike', key: toggleStrikethroughCommand.key, label: '删除线' },
  { command: 'code', key: createCodeBlockCommand.key, label: '代码块' },
]

describe('runEditorCommand', () => {
  it.each(cases)('$command 映射到 $label 命令键', ({ command, key }) => {
    const run = vi.fn((_key: unknown) => true)

    expect(runEditorCommand(command, run)).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0]).toBe(key)
  })

  it('回传命令执行结果，未执行时返回 false', () => {
    expect(runEditorCommand('undo', () => false)).toBe(false)
  })
})
