import type { AppCommand, CommandContext } from './app-command'
import { isCommandAvailable } from './command-context'

export interface AppCommandRegistry {
  register(command: AppCommand): void
  get(id: string): AppCommand | undefined
  /** 只返回当前上下文可用的命令（命令面板、菜单灰显判断的单一来源） */
  list(context: CommandContext): AppCommand[]
  /** 执行并返回是否真正执行了；未注册或 disabled 均返回 false */
  execute(id: string, context: CommandContext): Promise<boolean>
}

const isDevBuild = (): boolean => process.env.NODE_ENV !== 'production'

export const createAppCommandRegistry = (): AppCommandRegistry => {
  const commands = new Map<string, AppCommand>()

  return {
    register(command) {
      const duplicated = commands.has(command.id)
      // 覆盖旧注册是运行时合法行为（同名命令升级），开发期抛错以便尽早发现冲突
      commands.set(command.id, command)
      if (duplicated && isDevBuild()) {
        throw new Error(`[commands] 命令 ${command.id} 已存在，已覆盖注册`)
      }
    },

    get(id) {
      return commands.get(id)
    },

    list(context) {
      return Array.from(commands.values()).filter((command) =>
        command.enabled(context) && (!command.scope || isCommandAvailable(context, { requires: command.scope })),
      )
    },

    async execute(id, context) {
      const command = commands.get(id)
      if (!command || !command.enabled(context) || (command.scope && !isCommandAvailable(context, { requires: command.scope }))) return false
      await command.execute(context)
      return true
    },
  }
}
