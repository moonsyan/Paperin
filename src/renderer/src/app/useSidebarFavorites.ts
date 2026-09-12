import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePersistedSetting } from '../hooks/usePersistedSetting'
import { DEMO_TREE_SCOPE } from './constants'

export interface UseSidebarFavoritesOptions {
  /** 当前工作区根路径；未打开工作区时归入演示树作用域 */
  workspacePath?: string | null
  /** 设置加载完成（门控持久化写入与初始读取） */
  settingsReady: boolean
}

export interface UseSidebarFavoritesReturn {
  /** 当前作用域下的收藏路径（绝对路径，按收藏顺序） */
  favorites: string[]
  /** 切换收藏状态 */
  toggleFavorite: (path: string) => void
  /** 持久化收藏是否已读取合并完成（true 前的空列表不代表用户清空了收藏） */
  hydrated: boolean
}

type FavoritesByScope = Record<string, string[]>

/** 校验持久化形状：Record<scope, 非空字符串数组>；损坏数据返回 null（回退空记录，不抛错） */
const sanitizeFavorites = (value: unknown): FavoritesByScope | null => {
  if (typeof value !== 'object' || value === null) return null
  const record: FavoritesByScope = {}
  for (const [scope, paths] of Object.entries(value as Record<string, unknown>)) {
    if (typeof scope !== 'string' || scope.length === 0) return null
    if (!Array.isArray(paths)) return null
    if (!paths.every((item) => typeof item === 'string' && item.length > 0)) return null
    record[scope] = paths
  }
  return record
}

/**
 * 合并持久化收藏与加载期间的本地操作：
 * 本地已触碰过的作用域用「本地顺序优先 + 并集」——加载前用户看到的是空列表，
 * 任何 toggle 都是新增，不能被读取结果覆盖丢失；未触碰的作用域直接采用
 * 持久化值。空数组一律视为"无本地操作"，绝不当作用户删除记录。
 */
const mergeFavorites = (local: FavoritesByScope | null, loaded: FavoritesByScope): FavoritesByScope => {
  const merged: FavoritesByScope = { ...loaded }
  for (const [scope, localPaths] of Object.entries(local ?? {})) {
    const persisted = merged[scope] ?? []
    merged[scope] = localPaths.length === 0
      ? persisted
      : [...localPaths, ...persisted.filter((item) => !localPaths.includes(item))]
  }
  return merged
}

/**
 * 侧栏收藏（quiet-workspace 快捷导航的数据层）。
 *
 * 落点选择：收藏与「折叠记录」同属工作区视图状态，复用 `settings` 的
 * 按作用域分桶持久化（`Record<scope, string[]>`），因此不新增共享 schema、
 * 不改 IPC、不动 WorkspaceStateBundle 的解析与兼容分支。
 *
 * 生命周期：设置就绪后先读取持久化记录并合并（hydrate），再开放写入——
 * 只写不读会让重启后的收藏看似丢失。读取失败保留内存状态，不用空值覆盖。
 */
export function useSidebarFavorites({
  workspacePath = null,
  settingsReady,
}: UseSidebarFavoritesOptions): UseSidebarFavoritesReturn {
  const [byScope, setByScope] = useState<FavoritesByScope | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const scope = workspacePath ?? DEMO_TREE_SCOPE
  const favorites = useMemo(() => byScope?.[scope] ?? [], [byScope, scope])

  // 设置就绪后读取一次持久化收藏：成功则合并（本地点击优先），
  // 失败/桥缺失保留内存状态；卸载或重挂载都会重新对齐
  useEffect(() => {
    if (!settingsReady) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await window.desktopAPI?.settings.get('sidebarFavorites')
        if (cancelled) return
        const loaded = sanitizeFavorites(res)
        if (loaded) setByScope((prev) => mergeFavorites(prev, loaded))
      } catch {
        // 读取失败：不覆盖内存状态，也不把失败写回持久化
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [settingsReady])

  usePersistedSetting('sidebarFavorites', byScope, settingsReady && hydrated, 500)

  const toggleFavorite = useCallback((path: string) => {
    setByScope((prev) => {
      const current = prev?.[scope] ?? []
      const next = current.includes(path)
        ? current.filter((item) => item !== path)
        : [...current, path]
      return { ...(prev ?? {}), [scope]: next }
    })
  }, [scope])

  return { favorites, toggleFavorite, hydrated }
}
