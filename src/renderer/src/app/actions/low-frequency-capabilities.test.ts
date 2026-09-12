// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { RefObject } from 'react'

import { createAppCommandRegistry } from '../commands/app-command-registry'
import type { AppCommandRegistry } from '../commands/app-command-registry'
import { createCommandContext } from '../commands/command-context'
import type { CommandContext, CommandScope } from '../commands/command-context'
import type { EditorHandle } from '../../components/Editor'
import { createAppActionCommands } from './commands'
import { useActionDispatcher } from './useActionDispatcher'
import type { ActionHandlers, ActionHandlersRef } from './commands/types'

/**
 * 低频能力登记契约。
 *
 * 图片 / 发布 / 导出 / 版本历史 / 设置这些能力平时不占界面，只靠菜单、快捷键和
 * 命令面板触达，最容易在重构中「悄悄失去入口」或「失去作用域判断」。这里把
 * docs/command-panels.md 的登记表固化成测试：新增或改名低频能力时，
 * 要么补上登记，要么显式改这张表，不能默默漂移。
 */

/** 无操作处理器：可用性只读 scope 与 context，不会触碰这些字段 */
const stubHandlersRef = (): ActionHandlersRef =>
  ({ current: {} as ActionHandlers }) as ActionHandlersRef

const createRegistry = (): AppCommandRegistry => {
  const registry = createAppCommandRegistry()
  for (const command of createAppActionCommands(stubHandlersRef())) registry.register(command)
  return registry
}

/**
 * 低频能力 → 命令 id / 作用域。
 * `hint` 表示该命令必须有 `unavailableHint`（存在运行期守卫、快捷键路径不能静默）。
 */
const LOW_FREQUENCY_CAPABILITIES: Array<{
  id: string
  scope: CommandScope
  hint?: boolean
  note: string
}> = [
  { id: 'images', scope: 'app', note: '图片管理：无工作区时弹层自带空状态，不需作用域' },
  { id: 'publish', scope: 'document', note: '发布：需要当前文档正文' },
  { id: 'exportPdf', scope: 'document', note: '导出 PDF：需要当前文档' },
  { id: 'exportHtml', scope: 'document', note: '导出 HTML：需要当前文档' },
  { id: 'exportMarkdown', scope: 'document', note: '导出 Markdown：需要当前文档' },
  { id: 'exportDocx', scope: 'document', note: '导出 DOCX：需要当前文档' },
  { id: 'exportPandoc', scope: 'document', note: '导出 EPUB/LaTeX：需要当前文档' },
  { id: 'versionHistory', scope: 'document', note: '版本历史：按文件路径取快照' },
  { id: 'settings', scope: 'app', note: '设置：全局可用' },
  { id: 'stats', scope: 'app', note: '写作统计：无内容时展示零值，不阻断' },
  {
    id: 'graph',
    scope: 'workspace',
    hint: true,
    note: '关系图谱：依赖工作区链接索引',
  },
  {
    id: 'wsSearch',
    scope: 'workspace',
    hint: true,
    note: '工作区全文搜索：依赖工作区索引',
  },
]

const contextOf = (input: Parameters<typeof createCommandContext>[0]): CommandContext =>
  createCommandContext(input)

const availableIds = (registry: AppCommandRegistry, context: CommandContext): Set<string> =>
  new Set(registry.list(context).map((command) => command.id))

describe('低频能力登记表', () => {
  it('每项都已登记为命令，作用域与登记表一致', () => {
    const registry = createRegistry()
    for (const capability of LOW_FREQUENCY_CAPABILITIES) {
      const command = registry.get(capability.id)
      expect(command, `低频能力 ${capability.id}（${capability.note}）未登记为命令`).toBeDefined()
      expect(command?.scope ?? 'app', `${capability.id} 的作用域与登记表不符`).toBe(
        capability.scope,
      )
    }
  })

  it('需要运行期守卫的低频能力都给出不可用原因（快捷键路径不静默）', () => {
    const registry = createRegistry()
    for (const capability of LOW_FREQUENCY_CAPABILITIES) {
      const command = registry.get(capability.id)
      if (!capability.hint) continue
      expect(command?.unavailableHint, `${capability.id} 缺少 unavailableHint`).toBeTruthy()
      expect(command?.unavailableHint ?? '').toMatch(/工作区|文件夹/)
    }
  })
})

describe('低频能力按上下文可用性', () => {
  it('没有知识库、没有文档：只剩全局能力，工作区与文档级能力全部挡下', () => {
    const available = availableIds(createRegistry(), contextOf({}))
    for (const id of ['graph', 'wsSearch', 'linksPanel', 'tagsPanel', 'qualityPanel']) {
      expect(available.has(id), `${id} 不应在没有知识库时可用`).toBe(false)
    }
    for (const id of ['publish', 'exportPdf', 'exportHtml', 'versionHistory', 'saveAs', 'outline']) {
      expect(available.has(id), `${id} 不应在没有活动文档时可用`).toBe(false)
    }
    for (const id of ['images', 'settings', 'new', 'open', 'commandPalette']) {
      expect(available.has(id), `${id} 应始终可用`).toBe(true)
    }
  })

  it('有知识库但没有活动文档：工作区级可用、文档级仍挡下', () => {
    const available = availableIds(createRegistry(), contextOf({ workspaceId: '/tmp/ws' }))
    for (const id of ['graph', 'wsSearch', 'linksPanel', 'tagsPanel', 'qualityPanel']) {
      expect(available.has(id), `${id} 应在有知识库时可用`).toBe(true)
    }
    for (const id of ['publish', 'versionHistory', 'saveAs']) {
      expect(available.has(id), `${id} 不应在没有活动文档时可用`).toBe(false)
    }
  })

  it('打开外部 Markdown（无知识库但有文档）时，文档级能力仍可用', () => {
    const available = availableIds(createRegistry(), contextOf({ activeFileId: 'file-1' }))
    for (const id of ['publish', 'exportHtml', 'exportDocx', 'versionHistory', 'saveAs']) {
      expect(available.has(id), `${id} 应在有活动文档时可用`).toBe(true)
    }
    // 工作区级能力仍不可用：链接索引/全文索引都不存在
    expect(available.has('graph')).toBe(false)
    expect(available.has('wsSearch')).toBe(false)
  })

  it('执行入口与可用清单同源：挡下的命令不会被执行', async () => {
    const registry = createRegistry()
    const ok = await registry.execute('publish', contextOf({}))
    expect(ok).toBe(false)
  })
})

describe('分发入口的不可用提示', () => {
  const setup = (context: CommandContext, available: Set<string>) => {
    const registry = createRegistry()
    const onCommandUnavailable = vi.fn()
    const runCommand = vi.fn(async (id: string) => registry.execute(id, context))
    const { result } = renderHook(() =>
      useActionDispatcher({
        editorRef: { current: null } as RefObject<EditorHandle>,
        commandRegistry: registry,
        runCommand,
        isActionAvailable: (action: string) => available.has(action),
        handleSelectWorkspaceFile: vi.fn(async () => true),
        onCommandUnavailable,
      }),
    )
    return { result, onCommandUnavailable, runCommand }
  }

  it('命令被作用域挡下时报告原因，且不进入执行', () => {
    const { result, onCommandUnavailable, runCommand } = setup(contextOf({}), new Set(['settings']))
    act(() => result.current.handleAction('graph'))

    expect(runCommand).not.toHaveBeenCalled()
    expect(onCommandUnavailable).toHaveBeenCalledWith(
      '请先打开文件夹（工作区）后再查看知识图谱',
      'graph',
    )
  })

  it('快捷键别名归一后再判可用性', () => {
    const { result, runCommand } = setup(contextOf({ activeFileId: 'f1' }), new Set(['togglePreview']))
    act(() => result.current.handleAction('preview'))
    // 别名 preview → togglePreview，命中已注册命令后正常进入执行
    expect(runCommand).toHaveBeenCalledWith('togglePreview')
  })

  it('未登记的动作不参与可用性判断，直接交回原分发路径', () => {
    const { result, onCommandUnavailable, runCommand } = setup(contextOf({}), new Set())
    act(() => result.current.handleAction('undo'))
    expect(onCommandUnavailable).not.toHaveBeenCalled()
    expect(runCommand).not.toHaveBeenCalled()
  })
})
