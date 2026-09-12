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
  it('无记录且开关注启用时全部折叠', () => {
    const { result } = renderHook(() =>
      useSidebarCollapse({ initialCollapsedKeys: null, collapseFoldersOnOpen: true, treeNodes: nodes }),
    )
    expect(Array.from(result.current.collapsedKeys).sort()).toEqual([...ALL_FOLDER_KEYS].sort())
  })

  it('无记录且开关注停用时全部展开', () => {
    const { result } = renderHook(() =>
      useSidebarCollapse({ initialCollapsedKeys: null, collapseFoldersOnOpen: false, treeNodes: nodes }),
    )
    expect(result.current.collapsedKeys.size).toBe(0)
  })

  it('有记录时严格沿用记录，不受开关注影响', () => {
    const { result } = renderHook(() =>
      useSidebarCollapse({
        initialCollapsedKeys: ['root/c'],
        collapseFoldersOnOpen: true,
        treeNodes: nodes,
      }),
    )
    expect(Array.from(result.current.collapsedKeys)).toEqual(['root/c'])
  })

  it('记录为内联字面量（引用不稳定）时渲染收敛，不进入无限更新循环', () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders += 1
      return useSidebarCollapse({
        // 故意每次渲染都传新数组：守卫必须按内容而非引用比较
        initialCollapsedKeys: ['root/c'],
        collapseFoldersOnOpen: true,
        treeNodes: nodes,
      })
    })
    expect(Array.from(result.current.collapsedKeys)).toEqual(['root/c'])
    // 首次应用记录触发一次重渲染，守卫随后按内容命中即停止
    expect(renders).toBeLessThanOrEqual(2)
  })

  it('点击折叠本文件夹及其后代一并折叠，并写回记录', () => {
    const onCollapsedKeysChange = vi.fn()
    const { result } = renderHook(() =>
      useSidebarCollapse({
        initialCollapsedKeys: null,
        collapseFoldersOnOpen: false,
        treeNodes: nodes,
        onCollapsedKeysChange,
      }),
    )
    act(() => result.current.toggleCollapse('root/a'))
    expect(Array.from(result.current.collapsedKeys).sort()).toEqual(['root/a', 'root/a/b'])
    expect(onCollapsedKeysChange).toHaveBeenCalledWith(
      expect.arrayContaining(['root/a', 'root/a/b']),
    )
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
    // root/a 展开，root/a/b 仍保持折叠
    expect(result.current.collapsedKeys.has('root/a')).toBe(false)
    expect(result.current.collapsedKeys.has('root/a/b')).toBe(true)
    expect(result.current.collapsedKeys.has('root')).toBe(true)
  })

  it('切换折叠开关会按新开关重算初始态（无记录时）', () => {
    const { result, rerender } = renderHook(
      ({ collapseFoldersOnOpen }: { collapseFoldersOnOpen: boolean }) =>
        useSidebarCollapse({ initialCollapsedKeys: null, collapseFoldersOnOpen, treeNodes: nodes }),
      { initialProps: { collapseFoldersOnOpen: true } },
    )
    expect(result.current.collapsedKeys.size).toBe(4)
    rerender({ collapseFoldersOnOpen: false })
    expect(result.current.collapsedKeys.size).toBe(0)
  })
})
