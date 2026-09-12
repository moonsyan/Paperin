import type { JSX, RefObject } from 'react'
import { TabBar } from '../components/TabBar'
import { CurrentFileBanner } from '../components/CurrentFileBanner'
import type { CurrentFileSource } from '../components/CurrentFileBanner'
import type { RecentFile } from '../components/MenuBar'
import type { OpenFile } from '../components/Sidebar'
import type { ShortcutMap } from '../data/shortcuts'
import { AppTopBar } from './AppTopBar'

/**
 * 顶栏插槽装配（三区收敛后）：标签栏落入中区，当前文件上下文落入右区。
 *
 * 单独成模块的原因：顶栏三区是纯装配关系，与 App 的状态编排无关；
 * 放在 AppComposition 里会让该文件继续膨胀（项目 450 行门禁），
 * 也把「标签栏怎么接」和「应用怎么编排」两类关注点混在一起。
 */

export interface TopBarTabsProps {
  openFiles: OpenFile[]
  activeFileId: string
  savedMap: Record<string, boolean>
  /** 工作区根路径：标签栏同名文件消歧（相对目录标注） */
  workspacePath?: string | null
  /** 切换标签（调用方负责先取消图谱激活态） */
  onSwitchFile: (id: string) => void
  onCloseTab: (id: string) => void
  onCloseOtherTabs: (id: string) => void
  onCloseAllTabs: () => void
  onTogglePinnedTab: (id: string) => void
  onReorderTabs: (from: number, to: number) => void
  graphTabOpen: boolean
  graphTabActive: boolean
  onActivateGraphTab: () => void
  onCloseGraphTab: () => void
}

export function TopBarTabs(props: TopBarTabsProps): JSX.Element {
  return (
    <TabBar
      openFiles={props.openFiles}
      activeFileId={props.activeFileId}
      savedMap={props.savedMap}
      workspacePath={props.workspacePath}
      onSwitch={props.onSwitchFile}
      onClose={props.onCloseTab}
      onCloseOthers={props.onCloseOtherTabs}
      onCloseAll={props.onCloseAllTabs}
      onTogglePin={props.onTogglePinnedTab}
      onReorder={props.onReorderTabs}
      graphTabOpen={props.graphTabOpen}
      graphTabActive={props.graphTabActive}
      onGraphTabSwitch={props.onActivateGraphTab}
      onGraphTabClose={props.onCloseGraphTab}
    />
  )
}

export interface TopBarFileContextProps {
  /** 无打开文件时不渲染 */
  visible: boolean
  title: string
  path?: string | null
  workspacePath?: string | null
  workspaceName?: string | null
  source: CurrentFileSource
  dirty: boolean
}

export function TopBarFileContext({
  visible,
  title,
  path = null,
  workspacePath = null,
  workspaceName = null,
  source,
  dirty,
}: TopBarFileContextProps): JSX.Element | null {
  if (!visible) return null
  return (
    <CurrentFileBanner
      title={title}
      path={path}
      workspacePath={workspacePath}
      workspaceName={workspaceName}
      source={source}
      dirty={dirty}
    />
  )
}

export interface AppTopBarHostProps {
  /* 顶栏布局与外观 */
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  focusMode: boolean
  onToggleFocusMode: () => void
  settingsOpen: boolean
  onOpenSettings: () => void
  effectiveTheme: string
  onThemeChange: (theme: string) => void
  onAction: (action: string) => void
  recentFiles: RecentFile[]
  shortcuts: ShortcutMap
  docTitle: string
  titleRef: RefObject<HTMLDivElement>
  onTitleBlur: (event: React.FocusEvent<HTMLDivElement>) => void
  onTitleKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  workspaceName: string
  workspacePath?: string | null
  /** 菜单灰显判断：命令注册表按 scope + CommandContext 决定可用性 */
  isActionEnabled?: (action: string) => boolean
  /* 中区标签栏 */
  openFiles: OpenFile[]
  activeFileId: string
  savedMap: Record<string, boolean>
  onSwitchFile: (id: string) => void
  onCloseTab: (id: string) => void
  onCloseOtherTabs: (id: string) => void
  onCloseAllTabs: () => void
  onTogglePinnedTab: (id: string) => void
  onReorderTabs: (from: number, to: number) => void
  graphTabOpen: boolean
  graphTabActive: boolean
  onActivateGraphTab: () => void
  onCloseGraphTab: () => void
  /* 右区当前文件上下文 */
  filePath?: string | null
  fileSource: CurrentFileSource
  fileDirty: boolean
}

/**
 * 顶栏宿主：把三区收敛后的 AppTopBar 与两个插槽装配在一起。
 * AppComposition 只声明「顶栏需要什么」，不再展开插槽内部结构。
 */
export function AppTopBarHost(props: AppTopBarHostProps): JSX.Element {
  return (
    <AppTopBar
      sidebarCollapsed={props.sidebarCollapsed} onToggleSidebar={props.onToggleSidebar}
      focusMode={props.focusMode} onToggleFocusMode={props.onToggleFocusMode}
      settingsOpen={props.settingsOpen} onOpenSettings={props.onOpenSettings}
      effectiveTheme={props.effectiveTheme} onThemeChange={props.onThemeChange}
      onAction={props.onAction} recentFiles={props.recentFiles} shortcuts={props.shortcuts}
      openFiles={props.openFiles} docTitle={props.docTitle} titleRef={props.titleRef}
      onTitleBlur={props.onTitleBlur} onTitleKeyDown={props.onTitleKeyDown}
      workspaceName={props.workspaceName} workspacePath={props.workspacePath}
      isActionEnabled={props.isActionEnabled}
      tabs={
        <TopBarTabs
          openFiles={props.openFiles} activeFileId={props.activeFileId} savedMap={props.savedMap}
          workspacePath={props.workspacePath}
          onSwitchFile={props.onSwitchFile} onCloseTab={props.onCloseTab}
          onCloseOtherTabs={props.onCloseOtherTabs} onCloseAllTabs={props.onCloseAllTabs}
          onTogglePinnedTab={props.onTogglePinnedTab} onReorderTabs={props.onReorderTabs}
          graphTabOpen={props.graphTabOpen} graphTabActive={props.graphTabActive}
          onActivateGraphTab={props.onActivateGraphTab} onCloseGraphTab={props.onCloseGraphTab}
        />
      }
      fileContext={
        <TopBarFileContext
          visible={props.openFiles.length > 0} title={props.docTitle} path={props.filePath}
          workspacePath={props.workspacePath} workspaceName={props.workspaceName}
          source={props.fileSource} dirty={props.fileDirty}
        />
      }
    />
  )
}
