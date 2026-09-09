import type { AppCommand } from './app-command'

/** 命令执行所在的最小作用域。作用域越具体，前置条件越多。 */
export type CommandScope = 'app' | 'workspace' | 'document'

/** 渲染层命令入口共享的上下文快照。旧调用方只需提供三个历史字段即可。 */
export interface CommandContext {
  activeFileId: string
  hasWorkspace: boolean
  hasUnsavedChanges: boolean
  workspaceId?: string
  source?: CommandScope
}

export interface CommandContextInput {
  activeFileId?: string | null
  workspaceId?: string | null
  hasWorkspace?: boolean
  hasUnsavedChanges?: boolean
}

export interface NormalizedCommandContext {
  activeFileId: string
  workspaceId: string
  hasWorkspace: boolean
  hasUnsavedChanges: boolean
  source: CommandScope
}

export interface CommandAvailability {
  requires: CommandScope
}

export function createCommandContext(input: CommandContextInput): NormalizedCommandContext {
  const activeFileId = input.activeFileId?.trim() ?? ''
  const workspaceId = input.workspaceId?.trim() ?? ''
  const hasWorkspace = input.hasWorkspace ?? Boolean(workspaceId)
  const source: CommandScope = activeFileId ? 'document' : hasWorkspace ? 'workspace' : 'app'
  return {
    activeFileId,
    workspaceId,
    hasWorkspace,
    hasUnsavedChanges: input.hasUnsavedChanges ?? false,
    source,
  }
}

export function isCommandAvailable(
  context: Pick<CommandContext, 'activeFileId' | 'hasWorkspace'>,
  availability: CommandAvailability,
): boolean {
  if (availability.requires === 'app') return true
  if (availability.requires === 'workspace') return context.hasWorkspace
  // External Markdown files are full document contexts even when no knowledge
  // base is open. Requiring a workspace here would hide save/editor panels.
  return Boolean(context.activeFileId)
}

/** 将注册表中的命令转换为命令面板条目；调用方可叠加旧静态命令保持兼容。 */
export function toPaletteCommands(
  commands: readonly AppCommand[],
): Array<{ id: string; label: string }> {
  return commands.map((command) => ({ id: command.id, label: command.title }))
}
