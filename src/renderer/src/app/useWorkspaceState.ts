import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { usePersistedSetting } from '../hooks/usePersistedSetting'
import { DEMO_TREE_SCOPE } from './constants'
import { resolveEffectiveTheme } from '../lib/workspace-state'
import {
  DEFAULT_WORKSPACE_SETTINGS,
} from '../../../shared/workspace-state'
import type {
  SidebarView,
  WorkspaceDocumentsState,
  WorkspaceSettingsState,
} from '../../../shared/workspace-state'
import type { WorkspaceInfo } from '../components/Sidebar'
import { buildWorkspaceFileTree, collectFolderKeys } from '../components/Sidebar/fileTree'
import type { ContextDockState } from '../components/ContextDock/context-dock-state'

export interface UseWorkspaceStateOptions {
  /** 会话级全局主题值（用于解析继承） */
  theme: string
  /** 会话级全局主题 setter（工作区继承模式下由本 hook 覆写） */
  setTheme: Dispatch<SetStateAction<string>>
  /** 设置加载完成（门控侧栏持久化写入） */
  settingsReady: boolean
}

export interface UseWorkspaceStateReturn {
  workspace: WorkspaceInfo | null
  setWorkspace: Dispatch<SetStateAction<WorkspaceInfo | null>>
  workspaceSettings: WorkspaceSettingsState
  setWorkspaceSettings: Dispatch<SetStateAction<WorkspaceSettingsState>>
  workspaceDocuments: WorkspaceDocumentsState
  setWorkspaceDocuments: Dispatch<SetStateAction<WorkspaceDocumentsState>>
  workspaceCollapsedKeys: string[] | null
  setWorkspaceCollapsedKeys: Dispatch<SetStateAction<string[] | null>>
  /** 工作区展开路径记忆；null = 无记忆 */
  workspaceExpandedKeys: string[] | null
  setWorkspaceExpandedKeys: Dispatch<SetStateAction<string[] | null>>
  workspaceStateReady: boolean
  setWorkspaceStateReady: Dispatch<SetStateAction<boolean>>
  /** workspace.path 的 ref 镜像（供异步回调/编辑器路径解析读取最新值） */
  workspacePathRef: MutableRefObject<string | undefined>
  /** workspaceDocuments 的 ref 镜像（供文档视图捕获与恢复读取最新值） */
  workspaceDocumentsRef: MutableRefObject<WorkspaceDocumentsState>
  /** 当前树作用域的折叠记录 */
  currentCollapsedKeys: string[] | null
  /** 当前工作区展开记忆（演示树为 undefined） */
  currentExpandedKeys: string[] | null | undefined
  /** 有效主题（解析继承后） */
  effectiveTheme: string
  /* 侧栏 */
  sidebarCollapsedKeys: Record<string, string[]> | null
  setSidebarCollapsedKeys: Dispatch<SetStateAction<Record<string, string[]> | null>>
  sidebarActiveTab: SidebarView
  setSidebarActiveTab: Dispatch<SetStateAction<SidebarView>>
  contextDockState: ContextDockState
  setContextDockState: Dispatch<SetStateAction<ContextDockState>>
  /* 回调 */
  handleThemeChange: (nextTheme: string) => void
  handleWorkspaceThemeEnabledChange: (enabled: boolean) => void
  handleCollapsedKeysChange: (keys: string[]) => void
  handleExpandedKeysChange: (keys: string[]) => void
  toast: string
  setToast: Dispatch<SetStateAction<string>>
}

/** 工作区核心状态与持久化。
 *  从 App.tsx 抽出，App 只负责装配与渲染。 */
export function useWorkspaceState({
  theme,
  setTheme,
  settingsReady,
}: UseWorkspaceStateOptions): UseWorkspaceStateReturn {
  const [toast, setToast] = useState('')

  /* ── 工作区核心状态 ── */
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettingsState>(
    DEFAULT_WORKSPACE_SETTINGS,
  )
  const [workspaceDocuments, setWorkspaceDocuments] = useState<WorkspaceDocumentsState>({
    schemaVersion: 1,
    documents: {},
  })
  const [workspaceCollapsedKeys, setWorkspaceCollapsedKeys] = useState<string[] | null>(null)
  const [workspaceExpandedKeys, setWorkspaceExpandedKeys] = useState<string[] | null>(null)
  const [workspaceStateReady, setWorkspaceStateReady] = useState(false)

  /* ── ref 镜像（供异步回调读取最新工作区状态） ── */
  const workspacePathRef = useRef<string | undefined>(undefined)
  workspacePathRef.current = workspace?.path
  const workspaceDocumentsRef = useRef(workspaceDocuments)
  workspaceDocumentsRef.current = workspaceDocuments

  /* ── 侧栏状态 ── */
  const [sidebarCollapsedKeys, setSidebarCollapsedKeys] = useState<Record<string, string[]> | null>(null)
  const [sidebarActiveTab, setSidebarActiveTab] = useState<SidebarView>('files')
  const [contextDockState, setContextDockState] = useState<ContextDockState>({
    visibility: 'expanded',
    panel: 'outline',
    width: 312,
    compact: false,
  })

  /* ── 衍生值 ── */
  const effectiveTheme = resolveEffectiveTheme(theme, workspaceSettings.appearance.theme)

  /** 当前树作用域的折叠记录：null = 该工作区（或演示树）从未记录过折叠状态 */
  const currentCollapsedKeys = useMemo(() => {
    if (workspace) {
      if (workspaceExpandedKeys !== null) {
        const folders = collectFolderKeys(
          buildWorkspaceFileTree(workspace.path, workspace.tree),
        )
        const expanded = new Set(workspaceExpandedKeys)
        return folders.filter((key) => key !== workspace.path && !expanded.has(key))
      }
      return workspaceCollapsedKeys
    }
    if (sidebarCollapsedKeys == null) return null
    return sidebarCollapsedKeys[DEMO_TREE_SCOPE] ?? null
  }, [
    sidebarCollapsedKeys,
    workspace,
    workspaceCollapsedKeys,
    workspaceExpandedKeys,
  ])

  const currentExpandedKeys = useMemo(() => {
    if (!workspace) return undefined
    return workspaceExpandedKeys
  }, [workspace, workspaceExpandedKeys])

  /* ── 持久化效果 ── */

  /** 工作区主题设置保存（防抖 300ms） */
  useEffect(() => {
    if (!workspace || !workspaceStateReady) return
    const timer = setTimeout(() => {
      window.desktopAPI?.workspaceState.saveSettings(workspaceSettings).then((result) => {
        if (!result.ok) setToast('工作区设置保存失败')
      }).catch(() => setToast('工作区设置保存失败'))
    }, 300)
    return () => clearTimeout(timer)
  }, [workspace, workspaceSettings, workspaceStateReady])

  /** 工作区文档视图保存（防抖 1000ms） */
  useEffect(() => {
    if (!workspace || !workspaceStateReady) return
    const timer = setTimeout(() => {
      window.desktopAPI?.workspaceState.saveDocuments(workspaceDocuments).then((result) => {
        if (!result.ok) setToast('文档视图状态保存失败')
      }).catch(() => setToast('文档视图状态保存失败'))
    }, 1_000)
    return () => clearTimeout(timer)
  }, [workspace, workspaceDocuments, workspaceStateReady])

  // 折叠键持久化
  usePersistedSetting('sidebarCollapsedKeys', sidebarCollapsedKeys, settingsReady, 500)
  // 侧边栏活动标签页持久化
  usePersistedSetting('sidebarActiveTab', sidebarActiveTab, settingsReady)

  /* ── 回调 ── */

  /** 主题切换：有工作区且非继承模式 → 写工作区设置；否则写全局 */
  const handleThemeChange = useCallback((nextTheme: string) => {
    if (workspace && workspaceSettings.appearance.theme !== 'inherit') {
      setWorkspaceSettings((current) => ({
        ...current,
        appearance: { theme: nextTheme },
      }))
      return
    }
    setTheme(nextTheme)
  }, [workspace, workspaceSettings.appearance.theme, setTheme])

  /** 工作区级主题启用/禁用切换 */
  const handleWorkspaceThemeEnabledChange = useCallback((enabled: boolean) => {
    setWorkspaceSettings({
      schemaVersion: 1,
      appearance: { theme: enabled ? effectiveTheme : 'inherit' },
      editor: workspaceSettings.editor,
    })
  }, [effectiveTheme, workspaceSettings.editor])

  /** 折叠记录按当前树作用域写入；工作区同时推导展开记忆（含定位文件）。 */
  const handleCollapsedKeysChange = useCallback((keys: string[]) => {
    if (workspace) {
      setWorkspaceCollapsedKeys(keys)
      const folders = collectFolderKeys(
        buildWorkspaceFileTree(workspace.path, workspace.tree),
      )
      const knownFolders = new Set(folders)
      const knownExpanded = folders.filter(
        (key) => key !== workspace.path && !keys.includes(key),
      )
      setWorkspaceExpandedKeys((prev) => {
        const preserved = (prev ?? []).filter((path) => !knownFolders.has(path))
        return [...knownExpanded, ...preserved]
      })
      return
    }
    const scope = DEMO_TREE_SCOPE
    setSidebarCollapsedKeys((prev) => ({ ...(prev ?? {}), [scope]: keys }))
  }, [workspace])

  /**
   * 展开记忆写回：合并「当前树已知展开」与「尚未加载但仍在记忆中的路径」，
   * 避免懒加载丢深层展开记录。首次交互即从无记忆升级为有记忆。
   */
  const handleExpandedKeysChange = useCallback((knownExpanded: string[]) => {
    if (!workspace) return
    const knownFolders = new Set(
      collectFolderKeys(buildWorkspaceFileTree(workspace.path, workspace.tree)),
    )
    setWorkspaceExpandedKeys((prev) => {
      const preserved = (prev ?? []).filter((path) => !knownFolders.has(path))
      return [...knownExpanded, ...preserved]
    })
  }, [workspace])

  return {
    workspace,
    setWorkspace,
    workspaceSettings,
    setWorkspaceSettings,
    workspaceDocuments,
    setWorkspaceDocuments,
    workspaceCollapsedKeys,
    setWorkspaceCollapsedKeys,
    workspaceExpandedKeys,
    setWorkspaceExpandedKeys,
    workspaceStateReady,
    setWorkspaceStateReady,
    workspacePathRef,
    workspaceDocumentsRef,
    currentCollapsedKeys,
    currentExpandedKeys,
    effectiveTheme,
    sidebarCollapsedKeys,
    setSidebarCollapsedKeys,
    sidebarActiveTab,
    setSidebarActiveTab,
    contextDockState,
    setContextDockState,
    handleThemeChange,
    handleWorkspaceThemeEnabledChange,
    handleCollapsedKeysChange,
    handleExpandedKeysChange,
    toast,
    setToast,
  }
}
