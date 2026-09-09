import {
  createCodeBlockCommand,
  insertHrCommand,
  turnIntoTextCommand,
  toggleEmphasisCommand,
  toggleStrongCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand,
} from '@milkdown/kit/preset/commonmark'
import {
  addColAfterCommand,
  addRowAfterCommand,
  deleteSelectedCellsCommand,
  insertTableCommand,
  toggleStrikethroughCommand,
} from '@milkdown/kit/preset/gfm'
import { redoCommand, undoCommand } from '@milkdown/kit/plugin/history'
import type { EditorHandle } from '../components/Editor'

/** 单个编辑器命令：编辑器未就绪时静默跳过（与原 ed?.runCommand 一致） */
export type EditorActionHandler = (editor: EditorHandle | null) => void

/**
 * 菜单动作与全局快捷键共用的编辑器命令表。
 * 两处分发的键位语义完全一致，收敛到此避免双份映射漂移。
 *
 * 注意键名差异：菜单用 insertLink/insertImage（MenuBar 静态标签），
 * 快捷键用 link/image（ShortcutMap 键名）；两者指向同一命令。
 */
export const EDITOR_ACTIONS: Record<string, EditorActionHandler> = {
  undo: (ed) => ed?.runCommand(undoCommand.key),
  redo: (ed) => ed?.runCommand(redoCommand.key),
  bold: (ed) => ed?.runCommand(toggleStrongCommand.key),
  italic: (ed) => ed?.runCommand(toggleEmphasisCommand.key),
  strike: (ed) => ed?.runCommand(toggleStrikethroughCommand.key),
  insertLink: (ed) => ed?.insertMd('[链接文字](https://)'),
  insertImage: (ed) => ed?.insertMd('![图片描述](https://)'),
  // 快捷键侧的别名（ShortcutMap 键名）
  link: (ed) => ed?.insertMd('[链接文字](https://)'),
  image: (ed) => ed?.insertMd('![图片描述](https://)'),
  text: (ed) => ed?.runCommand(turnIntoTextCommand.key),
  h1: (ed) => ed?.runCommand(wrapInHeadingCommand.key, 1),
  h2: (ed) => ed?.runCommand(wrapInHeadingCommand.key, 2),
  h3: (ed) => ed?.runCommand(wrapInHeadingCommand.key, 3),
  ul: (ed) => ed?.runCommand(wrapInBulletListCommand.key),
  ol: (ed) => ed?.runCommand(wrapInOrderedListCommand.key),
  task: (ed) => ed?.insertMd('- [ ] '),
  quote: (ed) => ed?.runCommand(wrapInBlockquoteCommand.key),
  // 菜单「代码块」与快捷键 codeBlock 同源：commonmark 内置 Mod-Alt-c 也绑定
  // 该命令。编辑器有焦点时由 PM keymap 优先处理并 preventDefault（全局快捷键
  // 的 defaultPrevented 检查确保不双重触发）；此处仅在编辑器无焦点时兜底执行。
  code: (ed) => ed?.runCommand(createCodeBlockCommand.key),
  codeBlock: (ed) => ed?.runCommand(createCodeBlockCommand.key),
  table: (ed) => ed?.runCommand(insertTableCommand.key, { row: 3, col: 3 }),
  tableRow: (ed) => ed?.runCommand(addRowAfterCommand.key),
  tableCol: (ed) => ed?.runCommand(addColAfterCommand.key),
  tableDel: (ed) => ed?.runCommand(deleteSelectedCellsCommand.key),
  hr: (ed) => ed?.runCommand(insertHrCommand.key),
}

export const resolveEditorAction = (action: string): EditorActionHandler | undefined =>
  EDITOR_ACTIONS[action]
