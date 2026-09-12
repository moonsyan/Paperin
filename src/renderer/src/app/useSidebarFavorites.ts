import { useCallback, useMemo, useState } from 'react'
import { usePersistedSetting } from '../hooks/usePersistedSetting'
import { DEMO_TREE_SCOPE } from './constants'

export interface UseSidebarFavoritesOptions {
  /** 当前工作区根路径；未打开工作区时归入演示树作用域 */
  workspacePath?: string | null
  /** 设置加载完成（门控持久化写入） */
  settingsReady: boolean
}

export interface UseSidebarFavoritesReturn {
  /** 当前作用域下的收藏路径（绝对路径，按收藏顺序） */
  favorites: string[]
  /** 切换收藏状态 */
  toggleFavorite: (path: string) => void
}

/**
 * 侧栏收藏（quiet-workspace 快捷导航的数据层）。
 *
 * 落点选择：收藏与「折叠记录」同属工作区视图状态，复用 `settings` 的
 * 按作用域分桶持久化（`Record<scope, string[]>`），因此不新增共享 schema、
 * 不改 IPC、不动 WorkspaceStateBundle 的解析与兼容分支。
 */
export function useSidebarFavorites({
  workspacePath = null,
  settingsReady,
}: UseSidebarFavoritesOptions): UseSidebarFavoritesReturn {
  const [byScope, setByScope] = useState<Record<string, string[]> | null>(null)
  const scope = workspacePath ?? DEMO_TREE_SCOPE
  const favorites = useMemo(() => byScope?.[scope] ?? [], [byScope, scope])

  usePersistedSetting('sidebarFavorites', byScope, settingsReady, 500)

  const toggleFavorite = useCallback((path: string) => {
    setByScope((prev) => {
      const current = prev?.[scope] ?? []
      const next = current.includes(path)
        ? current.filter((item) => item !== path)
        : [...current, path]
      return { ...(prev ?? {}), [scope]: next }
    })
  }, [scope])

  return { favorites, toggleFavorite }
}
