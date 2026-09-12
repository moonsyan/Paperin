import { describe, expect, it } from 'vitest'
import {
  buildWorkspaceFileTree,
  collectFolderKeys,
  collectFolderKeysUnder,
  countTreeFiles,
  findNodeByKey,
  type UiNode,
} from './fileTree'

/** 复刻 Sidebar 的初始化 effect 在「默认打开文件夹全部折叠」开关下的行为 */
const computeInitialCollapsedKeys = (
  collapseFoldersOnOpen: boolean,
  initialCollapsedKeys: string[] | null | undefined,
  allFolderKeys: string[],
): Set<string> =>
  collapseFoldersOnOpen || initialCollapsedKeys == null
    ? new Set(allFolderKeys)
    : new Set(initialCollapsedKeys)

/** 复刻 Sidebar 的 toggleCollapse：折叠时无条件级联到所有后代，展开只动当前 */
const applyToggle = (
  prev: Set<string>,
  key: string,
  treeNodes: UiNode[],
): Set<string> => {
  const next = new Set(prev)
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
  return next
}

describe('工作区文件树', () => {
  it('保留中文文件名并收集嵌套文件夹键', () => {
    const nodes = buildWorkspaceFileTree('D:\\笔记', [
      {
        name: '项目',
        path: 'D:\\笔记\\项目',
        children: [{ name: '设计.md', path: 'D:\\笔记\\项目\\设计.md' }],
      },
    ])

    expect(nodes[0].children?.[0].name).toBe('项目')
    expect(collectFolderKeys(nodes)).toEqual(['D:\\笔记', 'D:\\笔记\\项目'])
  })

  it('findNodeByKey 能定位嵌套文件夹', () => {
    const nodes = buildWorkspaceFileTree('D:\\笔记', [
      {
        name: '项目',
        path: 'D:\\笔记\\项目',
        children: [
          {
            name: '子目录',
            path: 'D:\\笔记\\项目\\子目录',
            children: [{ name: 'a.md', path: 'D:\\笔记\\项目\\子目录\\a.md' }],
          },
        ],
      },
    ])
    expect(findNodeByKey(nodes, 'D:\\笔记\\项目\\子目录')?.name).toBe('子目录')
    expect(findNodeByKey(nodes, '不存在')).toBeNull()
  })

  it('collectFolderKeysUnder 收集自身及所有后代文件夹', () => {
    const nodes = buildWorkspaceFileTree('D:\\笔记', [
      {
        name: '项目',
        path: 'D:\\笔记\\项目',
        children: [
          {
            name: '子目录',
            path: 'D:\\笔记\\项目\\子目录',
            children: [{ name: 'a.md', path: 'D:\\笔记\\项目\\子目录\\a.md' }],
          },
        ],
      },
    ])
    const root = findNodeByKey(nodes, 'D:\\笔记\\项目')!
    expect(collectFolderKeysUnder(root)).toEqual(['D:\\笔记\\项目', 'D:\\笔记\\项目\\子目录'])
  })
})

/** 冒烟测试：复现「默认打开文件夹全部折叠」开关下的完整交互 */
describe('「默认打开文件夹全部折叠」冒烟', () => {
  // 构造与截图一致的树形：obsidian / 0.myself / 1.Study / 2.program / 2.java / 3.java模块 / 1.并发编程
  const tree = buildWorkspaceFileTree('D:\\obsidian', [
    {
      name: '0. myself',
      path: 'D:\\obsidian\\0. myself',
      children: [],
    },
    {
      name: '1. Study',
      path: 'D:\\obsidian\\1. Study',
      children: [
        {
          name: '1. docker',
          path: 'D:\\obsidian\\1. Study\\1. docker',
          children: [],
        },
        {
          name: '2. program',
          path: 'D:\\obsidian\\1. Study\\2. program',
          children: [
            {
              name: '2. java',
              path: 'D:\\obsidian\\1. Study\\2. program\\2. java',
              children: [
                {
                  name: '3. java模块',
                  path: 'D:\\obsidian\\1. Study\\2. program\\2. java\\3. java模块',
                  children: [
                    {
                      name: '1. 并发编程',
                      path: 'D:\\obsidian\\1. Study\\2. program\\2. java\\3. java模块\\1. 并发编程',
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ])
  const allKeys = collectFolderKeys(tree)

  it('设置开启 + 有持久记录 → 仍全部折叠（忽略持久化）', () => {
    const persisted = ['D:\\obsidian\\1. Study'] // 历史记录里 1.Study 是展开的
    const initial = computeInitialCollapsedKeys(true, persisted, allKeys)
    expect(initial.size).toBe(allKeys.length)
    expect(initial.has('D:\\obsidian\\1. Study')).toBe(true)
  })

  it('设置关闭 + 有持久记录 → 恢复原状', () => {
    const persisted = ['D:\\obsidian\\1. Study']
    const initial = computeInitialCollapsedKeys(false, persisted, allKeys)
    expect(initial.has('D:\\obsidian\\1. Study')).toBe(true)
    expect(initial.has('D:\\obsidian')).toBe(false)
  })

  it('设置关闭 + 无持久记录 → 全部折叠（保持原行为）', () => {
    const initial = computeInitialCollapsedKeys(false, null, allKeys)
    expect(initial.size).toBe(allKeys.length)
  })

  it('折叠根文件夹 → 一并折叠所有子文件夹（开关关闭也级联）', () => {
    const before = new Set<string>(['D:\\obsidian\\1. Study']) // 历史只折叠了 1.Study
    const after = applyToggle(before, 'D:\\obsidian', tree)
    // 全部文件夹都应进入折叠集合
    for (const k of allKeys) expect(after.has(k)).toBe(true)
  })

  it('折叠中间文件夹 → 仅级联其后代', () => {
    const before = new Set<string>()
    const target = 'D:\\obsidian\\1. Study'
    const after = applyToggle(before, target, tree)
    expect(after.has(target)).toBe(true)
    expect(after.has('D:\\obsidian\\1. Study\\1. docker')).toBe(true)
    expect(after.has('D:\\obsidian\\1. Study\\2. program')).toBe(true)
    expect(after.has('D:\\obsidian\\1. Study\\2. program\\2. java')).toBe(true)
    expect(after.has('D:\\obsidian\\1. Study\\2. program\\2. java\\3. java模块')).toBe(true)
    expect(after.has('D:\\obsidian\\1. Study\\2. program\\2. java\\3. java模块\\1. 并发编程')).toBe(true)
    // 同级不受影响
    expect(after.has('D:\\obsidian\\0. myself')).toBe(false)
  })

  it('展开中间文件夹 → 只移出当前，子文件夹保持折叠', () => {
    // 初始：所有子文件夹都在折叠集合里（包括 1.Study）
    const before = new Set(allKeys)
    const after = applyToggle(before, 'D:\\obsidian\\1. Study', tree)
    expect(after.has('D:\\obsidian\\1. Study')).toBe(false)
    // 子文件夹仍然在折叠集合里
    expect(after.has('D:\\obsidian\\1. Study\\1. docker')).toBe(true)
    expect(after.has('D:\\obsidian\\1. Study\\2. program')).toBe(true)
  })

  it('不管开关状态，折叠中间文件夹都级联（这是交互规范，与开关无关）', () => {
    // 即便初始所有文件夹都展开 + 开关关闭（不写入全折叠状态），
    // 用户点击折叠某个父目录时仍应把所有后代一起折叠。
    const before = new Set<string>()
    const after = applyToggle(before, 'D:\\obsidian\\1. Study', tree)
    expect(after.has('D:\\obsidian\\1. Study\\1. docker')).toBe(true)
    expect(after.has('D:\\obsidian\\1. Study\\2. program')).toBe(true)
    expect(after.has('D:\\obsidian\\1. Study\\2. program\\2. java')).toBe(true)
  })

  it('点击展开后再点击折叠同一目录 → 再次级联（与初始状态无关）', () => {
    // 第一轮：展开 1.Study（前提：所有键都在折叠集合里）
    const startAll = new Set(allKeys)
    const afterExpand = applyToggle(startAll, 'D:\\obsidian\\1. Study', tree)
    expect(afterExpand.has('D:\\obsidian\\1. Study')).toBe(false)
    expect(afterExpand.has('D:\\obsidian\\1. Study\\1. docker')).toBe(true)
    // 第二轮：再次点击 1.Study 把它合上 + 后代级联
    const afterCollapse = applyToggle(afterExpand, 'D:\\obsidian\\1. Study', tree)
    expect(afterCollapse.has('D:\\obsidian\\1. Study')).toBe(true)
    for (const k of allKeys) expect(afterCollapse.has(k)).toBe(true)
  })
})



describe('countTreeFiles', () => {
  it('递归统计文件叶子数，不含目录与根数组长度', () => {
    const tree = [
      { key: 'r', name: '根', kind: 'folder' as const, children: [
        { key: 'a', name: 'a.md', kind: 'file' as const },
        { key: 'sub', name: '子', kind: 'folder' as const, children: [
          { key: 'b', name: 'b.md', kind: 'file' as const },
          { key: 'c', name: 'c.md', kind: 'file' as const },
        ] },
      ] },
    ]
    expect(countTreeFiles(tree)).toBe(3)
  })

  it('深层目录与空树', () => {
    expect(countTreeFiles([])).toBe(0)
    const deep = [{ key: '1', name: 'L1', kind: 'folder' as const, children: [
      { key: '2', name: 'L2', kind: 'folder' as const, children: [
        { key: '3', name: 'L3', kind: 'folder' as const, children: [
          { key: 'f', name: 'deep.md', kind: 'file' as const },
        ] },
      ] },
    ] }]
    expect(countTreeFiles(deep)).toBe(1)
  })
})
