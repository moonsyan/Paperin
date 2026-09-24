import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collectFolderKeys, collectFolderKeysUnder, findNodeByKey, type UiNode } from './fileTree'

/**
 * Sidebar 折叠状态：
 * - 展开记忆模型（initialExpandedKeys !== undefined）：
 *   null = 无记忆 → 按开关决定初始态（根展开、子夹全折 / 全展）；
 *   string[] = 有记忆 → collapsed = 全部非根文件夹 − 展开集；懒加载新节点默认折。
 * - 旧折叠列表模型（仅 initialCollapsedKeys，演示树 / 旧布局迁移）：
 *   null = 无记录；有记录原样恢复。
 */

export interface UseSidebarCollapseOptions {
  /**
   * 展开路径记忆；传入该 prop（含 null）即启用展开记忆模型。
   * undefined = 不使用本模型，回退 initialCollapsedKeys。
   */
  initialExpandedKeys?: string[] | null
  /** 旧折叠记录；仅在未传入 initialExpandedKeys 时生效 */
  initialCollapsedKeys?: string[] | null
  /** 「默认打开文件夹全部折叠」开关，仅在无记忆时决定初始态 */
  collapseFoldersOnOpen: boolean
  /** 当前渲染的树（工作区树或演示树），用于枚举文件夹 key 与级联查找 */
  treeNodes: UiNode[]
  /** 折叠状态变更写回（持久化到当前树作用域） */
  onCollapsedKeysChange?: (keys: string[]) => void
  /**
   * 当前树上已知的展开路径写回（不含根）；调用方合并尚未加载的展开记忆。
   * 仅在用户切换折叠时触发。
   */
  onExpandedKeysChange?: (keys: string[]) => void
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

const rootKeySet = (treeNodes: UiNode[]): Set<string> =>
  new Set(treeNodes.filter((node) => node.kind === 'folder').map((node) => node.key))

/** 由展开集推导折叠集：非根且不在展开集中的文件夹一律折叠。 */
export const collapsedKeysFromExpanded = (
  allFolderKeys: readonly string[],
  rootKeys: ReadonlySet<string>,
  expandedKeys: readonly string[],
): Set<string> => {
  const expanded = new Set(expandedKeys)
  return new Set(
    allFolderKeys.filter((key) => !rootKeys.has(key) && !expanded.has(key)),
  )
}

/** 无记忆时的默认折叠：根展开，其余全折（或开关关闭时全展）。 */
export const defaultCollapsedKeys = (
  allFolderKeys: readonly string[],
  rootKeys: ReadonlySet<string>,
  collapseFoldersOnOpen: boolean,
): Set<string> => {
  if (!collapseFoldersOnOpen) return new Set()
  return new Set(allFolderKeys.filter((key) => !rootKeys.has(key)))
}

export function useSidebarCollapse({
  initialExpandedKeys,
  initialCollapsedKeys,
  collapseFoldersOnOpen,
  treeNodes,
  onCollapsedKeysChange,
  onExpandedKeysChange,
}: UseSidebarCollapseOptions): UseSidebarCollapseResult {
  const useExpandedModel = initialExpandedKeys !== undefined

  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => {
    const roots = rootKeySet(treeNodes)
    const all = collectFolderKeys(treeNodes)
    if (useExpandedModel) {
      return initialExpandedKeys == null
        ? defaultCollapsedKeys(all, roots, collapseFoldersOnOpen)
        : collapsedKeysFromExpanded(all, roots, initialExpandedKeys)
    }
    return new Set(initialCollapsedKeys ?? [])
  })

  const allFolderKeys = useMemo(() => collectFolderKeys(treeNodes), [treeNodes])
  const rootKeys = useMemo(() => rootKeySet(treeNodes), [treeNodes])

  const expandedSig = useExpandedModel
    ? (initialExpandedKeys == null ? null : initialExpandedKeys.join('\u0000'))
    : undefined
  const collapsedSig = !useExpandedModel
    ? (initialCollapsedKeys == null ? null : initialCollapsedKeys.join('\u0000'))
    : undefined

  const appliedCollapseRef = useRef<{
    mode: 'expanded' | 'collapsed'
    recordSig: string | null
    treeSig: string
    collapse: boolean
  } | null>(null)

  useEffect(() => {
    if (allFolderKeys.length === 0) return
    const treeSig = allFolderKeys.join('\u0000')
    const recordSig = useExpandedModel ? (expandedSig ?? null) : (collapsedSig ?? null)
    const mode = useExpandedModel ? 'expanded' : 'collapsed'
    const prev = appliedCollapseRef.current
    if (
      prev &&
      prev.mode === mode &&
      prev.treeSig === treeSig &&
      prev.recordSig === recordSig &&
      prev.collapse === collapseFoldersOnOpen
    ) {
      return
    }
    appliedCollapseRef.current = { mode, recordSig, treeSig, collapse: collapseFoldersOnOpen }

    if (useExpandedModel) {
      setCollapsedKeys(
        initialExpandedKeys == null
          ? defaultCollapsedKeys(allFolderKeys, rootKeys, collapseFoldersOnOpen)
          : collapsedKeysFromExpanded(allFolderKeys, rootKeys, initialExpandedKeys),
      )
      return
    }

    setCollapsedKeys(
      initialCollapsedKeys == null
        ? defaultCollapsedKeys(allFolderKeys, rootKeys, collapseFoldersOnOpen)
        : new Set(initialCollapsedKeys),
    )
  }, [
    allFolderKeys,
    collapseFoldersOnOpen,
    collapsedSig,
    expandedSig,
    initialCollapsedKeys,
    initialExpandedKeys,
    rootKeys,
    useExpandedModel,
  ])

  const toggleCollapse = useCallback(
    (key: string) => {
      const next = new Set(collapsedKeys)
      if (next.has(key)) {
        next.delete(key)
      } else {
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
      if (onExpandedKeysChange) {
        const knownExpanded = allFolderKeys.filter(
          (folderKey) => !next.has(folderKey) && !rootKeys.has(folderKey),
        )
        onExpandedKeysChange(knownExpanded)
      }
    },
    [
      allFolderKeys,
      collapsedKeys,
      onCollapsedKeysChange,
      onExpandedKeysChange,
      rootKeys,
      treeNodes,
    ],
  )

  return { collapsedKeys, toggleCollapse }
}
