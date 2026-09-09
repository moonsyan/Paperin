import { describe, expect, it, vi } from 'vitest'
import { createAppCommandRegistry } from './app-command-registry'
import type { CommandContext } from './app-command'

const context: CommandContext = {
  activeFileId: 'file-a',
  hasWorkspace: true,
  hasUnsavedChanges: false,
}

describe('createAppCommandRegistry', () => {
  it('命令面板、菜单和快捷键共享同一个 execute', async () => {
    const execute = vi.fn()
    const registry = createAppCommandRegistry()
    registry.register({ id: 'save', title: '保存', enabled: () => true, execute })
    await expect(registry.execute('save', context)).resolves.toBe(true)
    expect(execute).toHaveBeenCalledTimes(1)
    // 三个入口再次触发的是同一条命令实现
    await registry.execute('save', context)
    await registry.execute('save', context)
    expect(execute).toHaveBeenCalledTimes(3)
  })

  it('未注册的 id 返回 false 且不抛错', async () => {
    const registry = createAppCommandRegistry()
    await expect(registry.execute('ghost', context)).resolves.toBe(false)
    expect(registry.get('ghost')).toBeUndefined()
  })

  it('disabled 命令不执行并返回 false', async () => {
    const execute = vi.fn()
    const registry = createAppCommandRegistry()
    registry.register({
      id: 'export',
      title: '导出',
      enabled: (ctx) => Boolean(ctx.activeFileId),
      execute,
    })
    await expect(registry.execute('export', { ...context, activeFileId: '' })).resolves.toBe(false)
    expect(execute).not.toHaveBeenCalled()
  })

  it('list 只返回当前上下文可用的命令，可携带快捷键与标题', () => {
    const registry = createAppCommandRegistry()
    registry.register({ id: 'a.enabled', title: '可用', shortcut: 'Ctrl+S', enabled: () => true, execute: () => undefined })
    registry.register({ id: 'b.disabled', title: '不可用', enabled: (ctx) => Boolean(ctx.hasWorkspace), execute: () => undefined })
    const listed = registry.list({ ...context, hasWorkspace: false })
    expect(listed.map((c) => c.id)).toEqual(['a.enabled'])
    expect(listed[0].shortcut).toBe('Ctrl+S')
    expect(listed[0].title).toBe('可用')
  })

  it('重复 id 覆盖旧命令；非生产环境抛出冲突提示但不破坏覆盖结果', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const registry = createAppCommandRegistry()
    registry.register({ id: 'dup', title: '一', enabled: () => true, execute: first })
    expect(() =>
      registry.register({ id: 'dup', title: '二', enabled: () => true, execute: second }),
    ).toThrow(/dup/)
    await expect(registry.execute('dup', context)).resolves.toBe(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})
