import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collectFolderKeys, collectFolderKeysUnder, findNodeByKey, type UiNode } from './fileTree'

/**
 * Sidebar 折叠状态：
 * - 记录由 App 按树作用域（工作区路径/演示树）解析后传入：
 *   null = 当前树无记录（新打开的工作区/从未折叠过）→ 按开关决定初始态；
 *   有记录 → 原样恢复。
 * - 用户手动折叠/展开时实时写回当前作用域。
 *
 * 作用域解析在 App 完成，这里不做"记录匹配"判定——旧逻辑把空数组记录
 * 误判为匹配当前树，导致新工作区被全部平铺展开。
 */

export interface UseSidebarCollapseOptions {
  /** 当前树的折叠记录；null = 无记录，undefined = 尚未加载 */
  initialCollapsedKeys?: string[] | null
  /** 「默认打开文件夹全部折叠」开关，仅在无记录时决定初始态 */
  collapseFoldersOnOpen: boolean
  /** 当前渲染的树（工作区树或演示树），用于枚举文件夹 key 与级联查找 */
  treeNodes: UiNode[]
  /** 折叠状态变更写回（持久化到当前树作用域） */
  onCollapsedKeysChange?: (keys: string[]) => void
}

export interface UseSidebarCollapseResult {
  collapsedKeys: Set<string>
  /**
   * 切换折叠状态：
   *  - 点击展开：仅展开被点击的文件夹，子目录保持原状（不强制展开）。
   *  - 点击折叠：本文件夹及其所有后代文件夹一并折叠。
   * 级联折叠与初始开关独立——开关仅控制打开工作区时的初始状态。
   */
  toggleCollapse: (key: string) => void
}

export function useSidebarCollapse({
  initialCollapsedKeys,
  collapseFoldersOnOpen,
  treeNodes,
  onCollapsedKeysChange,
}: UseSidebarCollapseOptions): UseSidebarCollapseResult {
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(
    () => new Set(initialCollapsedKeys ?? []),
  )

  /** 当前渲染树的全部文件夹 key（含嵌套子文件夹） */
  const allFolderKeys = useMemo(() => collectFolderKeys(treeNodes), [treeNodes])

  /**
   * 折叠记录的内容签名。
   *
   * 守卫必须比较签名而非数组引用：调用方若传入内联数组字面量，
   * 每次渲染都是新引用，effect 依赖随之变化并再次 setState，
   * 将形成无限更新循环（表现为堆内存耗尽）。引用稳定性不是本 hook
   * 可以假定的契约。
   */
  const recordSig = initialCollapsedKeys == null ? null : initialCollapsedKeys.join('\u0000')

  /** 应用记录的指纹：记录内容 + 树结构 + 开关都未变时不重算 */
  const appliedCollapseRef = useRef<{
    recordSig: string | null
    treeSig: string
    collapse: boolean
  } | null>(null)

  useEffect(() => {
    if (allFolderKeys.length === 0) return
    const treeSig = allFolderKeys.join('\u0000')
    const prev = appliedCollapseRef.current
    // 设置异步加载完成后记录到达、更换工作区、切换折叠开关、
    // 用户手动折叠/展开时才会变化
    if (
      prev &&
      prev.treeSig === treeSig &&
      prev.recordSig === recordSig &&
      prev.collapse === collapseFoldersOnOpen
    ) {
      return
    }
    appliedCollapseRef.current = { recordSig, treeSig, collapse: collapseFoldersOnOpen }
    // 修复：用户展开文件夹后被立即重新折叠。
    // 有持久记录时严格沿用记录（用户上次的折叠/展开态），不受开关影响；
    // 无记录时按「默认打开文件夹全部折叠」开关决定初始态。
    setCollapsedKeys(
      initialCollapsedKeys == null
        ? collapseFoldersOnOpen
          ? new Set(allFolderKeys)
          : new Set<string>()
        : new Set(initialCollapsedKeys),
    )
  }, [initialCollapsedKeys, recordSig, allFolderKeys, collapseFoldersOnOpen])

  const toggleCollapse = useCallback(
    (key: string) => {
      // 在 updater 外基于当前状态算好 next，再一次性提交与写回，
      // 避免把回调副作用放进 updater（StrictMode 下 updater 会执行两次）
      const next = new Set(collapsedKeys)
      if (next.has(key)) {
        // 展开：仅展开被点击的文件夹，子文件夹保持原状
        next.delete(key)
      } else {
        // 折叠：本文件夹及其所有后代文件夹一并折叠
        next.add(key)
        const target = findNodeByKey(treeNodes, key)
        if (target) {
          for (const k of collectFolderKeysUnder(target)) {
            if (k !== key) next.add(k)
          }
        }
      }
      setCollapsedKeys(next)
      onCollapsedKeysChange?.(Array.from(next))
    },
    [collapsedKeys, onCollapsedKeysChange, treeNodes],
  )

  return { collapsedKeys, toggleCollapse }
}
