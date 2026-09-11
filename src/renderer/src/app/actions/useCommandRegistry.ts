import { useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { ContextDockPanel, ContextDockState } from '../../components/ContextDock/context-dock-state'
import type { SidebarView } from '../../../../shared/workspace-state'
import type { AppCommand, CommandContext } from '../commands/app-command'
import type { AppCommandRegistry } from '../commands/app-command-registry'
import { createAppCommandRegistry } from '../commands/app-command-registry'
import { applyLayoutPreset, BUILT_IN_LAYOUT_PRESETS } from '../workspace/layout-preset'
import type { AppliedLayoutState } from '../workspace/layout-preset'

/**
 * 应用命令注册表：菜单 / 快捷键 / 命令面板共享同一 execute 契约。
 *
 * 当前只承载两类注册：
 * - `save`：会话保存（走 saveImplRef 转发最新 handleSave）；
 * - `layout.preset.*`：布局预设，只改视图/宽度/开关，不动标签与文档内容。
 *
 * 其他动作（新建、导出、面板、视图切换等）仍在 useActionDispatcher 的 switch/case
 * 里分发；后续按域迁入本 hook 时，只需追加 register 调用即可，不必改 dispatcher。
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

    if (extraCommands) {
      for (const command of extraCommands) registry.register(command)
    }
  }

  /** 统一命令执行入口：菜单、快捷键和命令面板最终都落到这里 */
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

  return { commandRegistry: commandRegistryRef.current, runCommand }
}
