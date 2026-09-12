import { useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ContextDockPanel, ContextDockState } from '../../components/ContextDock/context-dock-state'
import type { SidebarView } from '../../../../shared/workspace-state'
import type { AppCommand, CommandContext } from '../commands/app-command'
import type { AppCommandRegistry } from '../commands/app-command-registry'
import { createAppCommandRegistry } from '../commands/app-command-registry'
import { applyLayoutPreset, BUILT_IN_LAYOUT_PRESETS } from '../workspace/layout-preset'
import type { AppliedLayoutState } from '../workspace/layout-preset'
import { ACTION_ALIASES, createAppActionCommands } from './commands'
import type { ActionHandlers } from './commands'

/**
 * 应用命令注册表：菜单 / 右键菜单 / 快捷键 / 命令面板共享同一 execute 契约。
 *
 * 承载三类注册：
 * - `save`：会话保存（走 saveImplRef 转发最新 handleSave）；
 * - `layout.preset.*`：布局预设，只改视图/宽度/开关，不动标签与文档内容；
 * - 应用层动作命令（`createAppActionCommands`）：文件/搜索/视图/面板/帮助域，
 *   处理器经 handlersRef 转发最新引用，注册只发生一次。
 *
 * StrictMode 双渲染保护：注册只发生一次，重复注册在开发期抛错，
 * 否则第二次渲染会命中开发期断言、整树被错误边界卸载。
 */
export function useCommandRegistry({
  handleSave,
  getLayoutState,
  setTypewriter,
  setSidebarActiveTab,
  setContextDockState,
  setSidebarWidth,
  centerCaret,
  activeFileId,
  workspacePathRef,
  getHasUnsavedChanges,
  actionHandlers,
  extraCommands,
}: {
  handleSave: () => Promise<void>
  getLayoutState: () => AppliedLayoutState
  setTypewriter: Dispatch<SetStateAction<boolean>>
  setSidebarActiveTab: Dispatch<SetStateAction<SidebarView>>
  setContextDockState: Dispatch<SetStateAction<ContextDockState>>
  setSidebarWidth: Dispatch<SetStateAction<number>>
  centerCaret: () => void
  activeFileId: string
  workspacePathRef: MutableRefObject<string | undefined>
  getHasUnsavedChanges?: () => boolean
  /** 应用层动作处理器：经 ref 转发，注册一次后始终读取最新引用 */
  actionHandlers: ActionHandlers
  /** 追加注册（例如未来的 export.*、panel.* 命令），只在首次渲染时消费 */
  extraCommands?: readonly AppCommand[]
}) {
  const commandRegistryRef = useRef<AppCommandRegistry | null>(null)
  if (!commandRegistryRef.current) {
    commandRegistryRef.current = createAppCommandRegistry()
  }

  // 经 ref 转发最新会话动作：注册只发生一次，而 handleSave 等 useCallback
  // 依赖变化后引用会更新
  const saveImplRef = useRef(handleSave)
  saveImplRef.current = handleSave

  const layoutStateRef = useRef(getLayoutState)
  layoutStateRef.current = getLayoutState
  const typewriterSetterRef = useRef(setTypewriter)
  typewriterSetterRef.current = setTypewriter

  const handlersRef = useRef(actionHandlers)
  handlersRef.current = actionHandlers

  const registeredRef = useRef(false)
  if (!registeredRef.current) {
    registeredRef.current = true
    const registry = commandRegistryRef.current

    registry.register({
      id: 'save',
      title: '保存',
      shortcut: 'Ctrl+S',
      enabled: () => true,
      execute: () => {
        void saveImplRef.current()
      },
    })

    for (const preset of BUILT_IN_LAYOUT_PRESETS) {
      registry.register({
        id: `layout.preset.${preset.id}`,
        title: `布局：${preset.name}`,
        enabled: () => true,
        execute: () => {
          const next = applyLayoutPreset(preset, layoutStateRef.current())
          setSidebarActiveTab('files')
          if (next.activeView !== 'files') {
            setContextDockState((current) => ({
              ...current,
              panel: next.activeView as ContextDockPanel,
              visibility: 'expanded',
            }))
          }
          setSidebarWidth(next.sidebarWidth)
          typewriterSetterRef.current(next.typewriterMode)
          if (next.typewriterMode) setTimeout(centerCaret, 0)
        },
      })
    }

    for (const command of createAppActionCommands(handlersRef)) {
      registry.register(command)
    }

    if (extraCommands) {
      for (const command of extraCommands) registry.register(command)
    }
  }

  /** 统一命令执行入口：菜单、右键菜单、快捷键和命令面板最终都落到这里 */
  const runCommand = useCallback(
    (id: string): Promise<boolean> => {
      const registry = commandRegistryRef.current
      if (!registry) return Promise.resolve(false)
      const context: CommandContext = {
        activeFileId,
        hasWorkspace: Boolean(workspacePathRef.current),
        hasUnsavedChanges: getHasUnsavedChanges?.() ?? false,
      }
      return registry.execute(id, context)
    },
    [activeFileId, getHasUnsavedChanges, workspacePathRef],
  )

  /**
   * 入口可用性（菜单灰显的单一来源）。
   *
   * 命令注册表已经用 `scope` + `CommandContext` 决定可用性，但只有真正「执行」时
   * 才会被拦下——菜单如果照旧全亮，用户点「知识图谱」/「工作区全文搜索」只会
   * 得到一次静默无响应（或一句 toast）。这里把同一份判断暴露给入口，让不可用的
   * 低频能力在点击之前就灰掉。
   *
   * 未登记的动作不属于注册表管辖（编辑器命令 undo/bold、参数化动作 openRecent:*、
   * 布局预设等），一律返回 true，交回原分发路径处理。
   */
  const isActionAvailable = useCallback(
    (action: string): boolean => {
      const registry = commandRegistryRef.current
      if (!registry) return true
      const normalized = ACTION_ALIASES[action] ?? action
      if (!registry.get(normalized)) return true
      return registry
        .list({
          activeFileId,
          hasWorkspace: Boolean(workspacePathRef.current),
          hasUnsavedChanges: getHasUnsavedChanges?.() ?? false,
        })
        .some((command) => command.id === normalized)
    },
    [activeFileId, getHasUnsavedChanges, workspacePathRef],
  )

  return { commandRegistry: commandRegistryRef.current, runCommand, isActionAvailable }
}
