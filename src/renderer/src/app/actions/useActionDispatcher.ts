import { useCallback } from 'react'
import type { RefObject } from 'react'
import type { EditorHandle } from '../../components/Editor'
import type { AppCommandRegistry } from '../commands/app-command-registry'
import { resolveEditorAction } from '../editorActions'
import { ACTION_ALIASES } from './commands'

/**
 * 统一动作分发：菜单、右键菜单、快捷键和命令面板最终都落到 handleAction。
 *
 * 分发优先级：
 * 1. 动作别名归一（快捷键 preview/focusMode → 菜单 togglePreview/toggleFocus）；
 * 2. 命令注册表已登记 → 走 runCommand，与命令面板同源，焦点策略读命令的
 *    focusEditor 元数据（always 立即聚焦 / settle 等 execute 完成后聚焦 /
 *    never 不聚焦）；
 * 3. 编辑器命令（撤销/格式/段落/表格）→ resolveEditorAction；
 * 4. 参数化动作（openRecent:*）→ 前缀匹配。
 *
 * 应用层动作的 switch/case 已全部迁入命令注册表（actions/commands/），
 * 本文件只保留分发骨架；新增动作只需注册命令，不再改这里。
 */
export function useActionDispatcher({
  editorRef,
  commandRegistry,
  runCommand,
  handleSelectWorkspaceFile,
}: {
  editorRef: RefObject<EditorHandle>
  commandRegistry: AppCommandRegistry | null
  runCommand: (id: string) => Promise<boolean>
  handleSelectWorkspaceFile: (path: string, pinned?: boolean) => Promise<boolean>
}) {
  const handleAction = useCallback(
    (action: string) => {
      const normalized = ACTION_ALIASES[action] ?? action
      const ed = editorRef.current

      // 注册表已登记的命令统一优先走注册表，菜单/右键/快捷键/命令面板共享
      // 同一 execute；焦点行为由命令的 focusEditor 元数据决定
      const registeredCommand = commandRegistry?.get(normalized)
      if (registeredCommand) {
        const focus = registeredCommand.focusEditor ?? 'always'
        if (focus === 'never') {
          void runCommand(normalized)
          return
        }
        if (focus === 'settle') {
          void runCommand(normalized).then(() => ed?.focus())
          return
        }
        void runCommand(normalized)
        ed?.focus()
        return
      }

      // 编辑器命令类动作（撤销/格式/段落/表格等）统一走共享命令表，
      // 与全局快捷键分发同源
      const editorAction = resolveEditorAction(normalized)
      if (editorAction) {
        editorAction(ed)
        return
      }

      if (normalized.startsWith('openRecent:')) {
        const path = normalized.slice('openRecent:'.length)
        void handleSelectWorkspaceFile(path)
      }
    },
    [commandRegistry, editorRef, handleSelectWorkspaceFile, runCommand],
  )

  return { handleAction }
}
