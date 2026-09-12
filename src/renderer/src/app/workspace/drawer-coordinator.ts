/**
 * 窄窗口抽屉协调（NEXT-UI-SPEC §8 / T11）。
 *
 * 窄窗口（<820px）下侧栏与右侧 ContextDock 都以模态抽屉形态出现，
 * 同一时刻最多打开一个。协调的关键约束：
 *
 * - **持久化布局偏好与瞬时 overlay 状态分开**：sidebarCollapsed 与
 *   ContextDock visibility 是用户布局偏好（持久化），抽屉互斥是瞬时
 *   overlay 状态（不持久化）。关闭抽屉不改偏好；拉宽窗口后两者都按
 *   偏好恢复。
 * - 打开右抽屉时左抽屉退出（最近打开者获胜）。
 * - Escape / 遮罩点击关闭当前显示的抽屉，只影响瞬时状态。
 */

export type DrawerId = 'sidebar' | 'dock'
/** 当前以模态抽屉形态打开的抽屉；null = 无（宽窗口或窄窗口下均未激活） */
export type DrawerOverlay = DrawerId | null

export interface DrawerVisibility {
  sidebar: boolean
  dock: boolean
}

/** 打开动作：最近打开者获胜，直接覆盖当前 overlay */
export const openDrawerOverlay = (_prev: DrawerOverlay, opening: DrawerId): DrawerOverlay => {
  void _prev
  return opening
}

/** Escape / 遮罩点击：只清瞬时状态，不改持久化偏好 */
export const closeDrawerOverlay = (_prev: DrawerOverlay): DrawerOverlay => {
  void _prev
  return null
}

/**
 * 进入窄窗口时的初始 overlay：若两侧偏好都是打开，保留侧栏（主导航优先）、
 * 退出 dock；只有一侧打开则该侧成为 overlay；都关闭则无 overlay。
 */
export const onNarrowEnter = (
  sidebarPrefOpen: boolean,
  dockPrefOpen: boolean,
): DrawerOverlay => {
  if (sidebarPrefOpen) return 'sidebar'
  if (dockPrefOpen) return 'dock'
  return null
}

/** 离开窄窗口：瞬时 overlay 失效，两抽屉回到偏好状态 */
export const onNarrowExit = (): DrawerOverlay => null

/**
 * 解析窄窗口下两个抽屉的有效可见性：
 * overlay 指向者显示；另一侧退出。宽窗口下直接用持久化偏好。
 */
export const resolveDrawerVisibility = (
  isNarrow: boolean,
  overlay: DrawerOverlay,
  sidebarPrefOpen: boolean,
  dockPrefOpen: boolean,
): DrawerVisibility => {
  if (!isNarrow) return { sidebar: sidebarPrefOpen, dock: dockPrefOpen }
  return {
    sidebar: overlay === 'sidebar',
    dock: overlay === 'dock',
  }
}
