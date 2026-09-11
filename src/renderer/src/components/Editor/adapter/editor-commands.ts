import type { CmdKey } from '@milkdown/kit/core'
import {
  createCodeBlockCommand,
  toggleEmphasisCommand,
  toggleStrongCommand,
} from '@milkdown/kit/preset/commonmark'
import { toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { redoCommand, undoCommand } from '@milkdown/kit/plugin/history'
import type { EditorCommand } from './editor-adapter'

/**
 * 应用层命令名 → Milkdown 命令键的映射。
 * 单独成模块是为了让 editor-adapter 保持零 Milkdown 依赖，
 * 同时让工具栏、快捷键与命令面板共用同一张映射表。
 */
export const runEditorCommand = (
  command: EditorCommand,
  run: <T>(key: CmdKey<T>, payload?: T) => boolean,
): boolean => {
  switch (command) {
    case 'undo':
      return run(undoCommand.key)
    case 'redo':
      return run(redoCommand.key)
    case 'bold':
      return run(toggleStrongCommand.key)
    case 'italic':
      return run(toggleEmphasisCommand.key)
    case 'strike':
      return run(toggleStrikethroughCommand.key)
    case 'code':
      return run(createCodeBlockCommand.key)
  }
}
