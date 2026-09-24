// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useSidebarCollapse } from './useSidebarCollapse'
import type { UiNode } from './fileTree'

afterEach(cleanup)

/** 树结构：根 / a / a/b / c，含 4 个文件夹 key 与 1 个文件 */
const nodes: UiNode[] = [
  {
    key: 'root',
    name: 'root',
    kind: 'folder',
    path: 'root',
    children: [
      {
        key: 'root/a',
        name: 'a',
        kind: 'folder',
        path: 'root/a',
        children: [
          { key: 'root/a/b', name: 'b', kind: 'folder', path: 'root/a/b', children: [] },
          { key: 'root/a/1.md', name: '1.md', kind: 'file', path: 'root/a/1.md' },
        ],
      },
      { key: 'root/c', name: 'c', kind: 'folder', path: 'root/c', children: [] },
    ],
  },
]

const ALL_FOLDER_KEYS = ['root', 'root/a', 'root/a/b', 'root/c']

describe('useSidebarCollapse', () => {
  it('无展开记忆且开关注启用时折叠非顶层文件夹（根保持展开）', () => {
    const { result } = renderHook(() =>
      useSidebarCollapse({ initialExpandedKeys: null, collapseFoldersOnOpen: true, treeNodes: nodes }),
    )
    expect(result.current.collapsedKeys.has('root')).toBe(false)
    expect(Array.from(result.current.collapsedKeys).sort()).toEqual(['root/a', 'root/a/b', 'root/c'])
  })

  it('无展开记忆且开关注停用时全部展开', () => {
    const { result } = renderHook(() =>
      useSidebarCollapse({ initialExpandedKeys: null, collapseFoldersOnOpen: false, treeNodes: nodes }),
    )
    expect(result.current.collapsedKeys.size).toBe(0)
  })

  it('有展开记忆时按展开集推导折叠，不受开关注影响', () => {
    const { result } = renderHook(() =>
      useSidebarCollapse({
        initialExpandedKeys: ['root/a'],
        collapseFoldersOnOpen: true,
        treeNodes: nodes,
      }),
    )
    expect(result.current.collapsedKeys.has('root')).toBe(false)
    expect(result.current.collapsedKeys.has('root/a')).toBe(false)
    expect(result.current.collapsedKeys.has('root/a/b')).toBe(true)
    expect(result.current.collapsedKeys.has('root/c')).toBe(true)
  })

  it('展开记忆为空数组时非根全部折叠', () => {
    const { result } = renderHook(() =>
      useSidebarCollapse({
        initialExpandedKeys: [],
        collapseFoldersOnOpen: false,
        treeNodes: nodes,
      }),
    )
    expect(Array.from(result.current.collapsedKeys).sort()).toEqual(['root/a', 'root/a/b', 'root/c'])
  })

  it('懒加载新文件夹节点默认折叠（有展开记忆时）', () => {
    const shallow: UiNode[] = [
      {
        key: 'root',
        name: 'root',
        kind: 'folder',
        path: 'root',
        children: [
          { key: 'root/a', name: 'a', kind: 'folder', path: 'root/a', children: [], childrenLoaded: false },
        ],
      },
    ]
    const { result, rerender } = renderHook(
      ({ treeNodes }: { treeNodes: UiNode[] }) =>
        useSidebarCollapse({
          initialExpandedKeys: ['root/a'],
          collapseFoldersOnOpen: true,
          treeNodes,
        }),
      { initialProps: { treeNodes: shallow } },
    )
    expect(result.current.collapsedKeys.has('root/a')).toBe(false)

    rerender({ treeNodes: nodes })
    expect(result.current.collapsedKeys.has('root/a')).toBe(false)
    expect(result.current.collapsedKeys.has('root/a/b')).toBe(true)
    expect(result.current.collapsedKeys.has('root/c')).toBe(true)
  })

  it('记录为内联字面量（引用不稳定）时渲染收敛，不进入无限更新循环', () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useSidebarCollapse({
        initialExpandedKeys: ['root/a'],
        collapseFoldersOnOpen: true,
        treeNodes: nodes,
      })
    })
    expect(result.current.collapsedKeys.has('root/a')).toBe(false)
    expect(renders).toBeLessThanOrEqual(2)
  })

  it('点击折叠本文件夹及其后代一并折叠，并写回折叠与展开记录', () => {
    const onCollapsedKeysChange = vi.fn()
    const onExpandedKeysChange = vi.fn()
    const { result } = renderHook(() =>
      useSidebarCollapse({
        initialExpandedKeys: null,
        collapseFoldersOnOpen: false,
        treeNodes: nodes,
        onCollapsedKeysChange,
        onExpandedKeysChange,
      }),
    )
    act(() => result.current.toggleCollapse('root/a'))
    expect(Array.from(result.current.collapsedKeys).sort()).toEqual(['root/a', 'root/a/b'])
    expect(onCollapsedKeysChange).toHaveBeenCalledWith(
      expect.arrayContaining(['root/a', 'root/a/b']),
    )
    expect(onExpandedKeysChange).toHaveBeenCalledWith(
      expect.arrayContaining(['root/c']),
    )
    expect(onExpandedKeysChange.mock.calls[0][0]).not.toContain('root/a')
  })

  it('点击展开只展开自身，后代保持原状', () => {
    const { result } = renderHook(() =>
      useSidebarCollapse({
        initialCollapsedKeys: ALL_FOLDER_KEYS,
        collapseFoldersOnOpen: true,
        treeNodes: nodes,
      }),
    )
    act(() => result.current.toggleCollapse('root/a'))
    expect(result.current.collapsedKeys.has('root/a')).toBe(false)
    expect(result.current.collapsedKeys.has('root/a/b')).toBe(true)
    expect(result.current.collapsedKeys.has('root')).toBe(true)
  })

  it('切换折叠开关会按新开关重算初始态（无记忆时）', () => {
    const { result, rerender } = renderHook(
      ({ collapseFoldersOnOpen }: { collapseFoldersOnOpen: boolean }) =>
        useSidebarCollapse({ initialExpandedKeys: null, collapseFoldersOnOpen, treeNodes: nodes }),
      { initialProps: { collapseFoldersOnOpen: true } },
    )
    expect(result.current.collapsedKeys.size).toBe(3)
    expect(result.current.collapsedKeys.has('root')).toBe(false)
    rerender({ collapseFoldersOnOpen: false })
    expect(result.current.collapsedKeys.size).toBe(0)
  })

  it('旧折叠列表模型：有记录时严格沿用', () => {
    const { result } = renderHook(() =>
      useSidebarCollapse({
        initialCollapsedKeys: ['root/c'],
        collapseFoldersOnOpen: true,
        treeNodes: nodes,
      }),
    )
    expect(Array.from(result.current.collapsedKeys)).toEqual(['root/c'])
  })
})
