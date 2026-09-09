import { describe, expect, it } from 'vitest'
import { resolveWikiTarget, collectMdFiles, findFileByName, createWikiIndexResolver } from './wiki-resolver'
import type { FolderTreeNode } from '../../../preload/api'

describe('collectMdFiles', () => {
  it('收集工作区树中所有 .md 文件路径', () => {
    const tree: FolderTreeNode[] = [
      { name: 'a.md', path: '/ws/a.md' },
      {
        name: 'sub',
        path: '/ws/sub',
        children: [
          { name: 'b.md', path: '/ws/sub/b.md' },
          { name: 'c.md', path: '/ws/sub/c.md' },
        ],
      },
    ]
    const files = collectMdFiles(tree)
    expect(files).toContain('/ws/a.md')
    expect(files).toContain('/ws/sub/b.md')
    expect(files).toContain('/ws/sub/c.md')
  })

  it('收集 .markdown 与大写 .MD 文件（与树扫描口径一致）', () => {
    const tree: FolderTreeNode[] = [
      { name: 'note.markdown', path: '/ws/note.markdown' },
      { name: 'TODO.MD', path: '/ws/TODO.MD' },
      { name: 'plain.txt', path: '/ws/plain.txt' },
    ]
    const files = collectMdFiles(tree)
    expect(files).toContain('/ws/note.markdown')
    expect(files).toContain('/ws/TODO.MD')
    expect(files).not.toContain('/ws/plain.txt')
  })
})

describe('findFileByName', () => {
  it('按文件名查找（大小写不敏感）', () => {
    const tree: FolderTreeNode[] = [
      { name: 'Readme.md', path: '/ws/Readme.md' },
    ]
    expect(findFileByName(tree, 'readme')).toBe('/ws/Readme.md')
    expect(findFileByName(tree, 'Readme.md')).toBe('/ws/Readme.md')
    expect(findFileByName(tree, 'unknown')).toBe(null)
  })
})

describe('resolveWikiTarget', () => {
  const tree: FolderTreeNode[] = [
    { name: 'index.md', path: 'D:/notes/index.md' },
    { name: 'todo.md', path: 'D:/notes/todo.md' },
    {
      name: 'sub',
      path: 'D:/notes/sub',
      children: [
        { name: 'note.md', path: 'D:/notes/sub/note.md' },
        {
          name: 'deep',
          path: 'D:/notes/sub/deep',
          children: [{ name: 'ideas.md', path: 'D:/notes/sub/deep/ideas.md' }],
        },
      ],
    },
    {
      name: 'projects',
      path: 'D:/notes/projects',
      children: [
        { name: 'readme.md', path: 'D:/notes/projects/readme.md' },
      ],
    },
  ]

  const workspacePath = 'D:/notes'

  it('精确匹配当前目录下的文件名', () => {
    const result = resolveWikiTarget('todo', workspacePath, 'D:/notes/index.md', tree)
    expect(result.resolved).toBe(true)
    expect(result.path).toBe('D:/notes/todo.md')
  })

  it('剥离标题锚点后按文件解析', () => {
    const result = resolveWikiTarget('todo#章节标题', workspacePath, 'D:/notes/index.md', tree)
    expect(result.resolved).toBe(true)
    expect(result.path).toBe('D:/notes/todo.md')
  })

  it('剥离块锚点（^block-id）后按文件解析', () => {
    const result = resolveWikiTarget('todo#^abc123', workspacePath, 'D:/notes/index.md', tree)
    expect(result.resolved).toBe(true)
    expect(result.path).toBe('D:/notes/todo.md')
  })

  it('文件名合法含 # 不被误剥锚点（两段式回归）', () => {
    const treeWithHash: FolderTreeNode[] = [
      { name: 'note#v2.md', path: 'D:/notes/note#v2.md' },
      { name: 'note.md', path: 'D:/notes/note.md' },
    ]
    // 直接引用含 # 的文件名，应命中该文件而不是被错误截断
    const r1 = resolveWikiTarget('note#v2', workspacePath, 'D:/notes/index.md', treeWithHash)
    expect(r1.resolved).toBe(true)
    expect(r1.path).toBe('D:/notes/note#v2.md')
    // 带扩展名引用同样命中
    const r2 = resolveWikiTarget('note#v2.md', workspacePath, 'D:/notes/index.md', treeWithHash)
    expect(r2.resolved).toBe(true)
    expect(r2.path).toBe('D:/notes/note#v2.md')
  })

  it('文件名合法含 ^ 不被误剥锚点（两段式回归）', () => {
    const treeWithCaret: FolderTreeNode[] = [
      { name: 'a^b.md', path: 'D:/notes/a^b.md' },
    ]
    const r = resolveWikiTarget('a^b', workspacePath, 'D:/notes/index.md', treeWithCaret)
    expect(r.resolved).toBe(true)
    expect(r.path).toBe('D:/notes/a^b.md')
  })

  it('同名前缀场景：note.md 与 note#v2.md 共存时，# 引用命中 #v2', () => {
    const treeBoth: FolderTreeNode[] = [
      { name: 'note.md', path: 'D:/notes/note.md' },
      { name: 'note#v2.md', path: 'D:/notes/note#v2.md' },
    ]
    // 含 # 时应优先命中含 # 的文件
    const r1 = resolveWikiTarget('note#v2', workspacePath, 'D:/notes/index.md', treeBoth)
    expect(r1.resolved).toBe(true)
    expect(r1.path).toBe('D:/notes/note#v2.md')
    // 不含 # 时只命中 note.md
    const r2 = resolveWikiTarget('note', workspacePath, 'D:/notes/index.md', treeBoth)
    expect(r2.resolved).toBe(true)
    expect(r2.path).toBe('D:/notes/note.md')
  })

  it('带扩展名的精确匹配', () => {
    const result = resolveWikiTarget('todo.md', workspacePath, 'D:/notes/index.md', tree)
    expect(result.resolved).toBe(true)
    expect(result.path).toBe('D:/notes/todo.md')
  })

  it('从子目录引用父目录文件', () => {
    const result = resolveWikiTarget('index', workspacePath, 'D:/notes/sub/note.md', tree)
    expect(result.resolved).toBe(true)
    expect(result.path).toBe('D:/notes/index.md')
  })

  it('以 / 开头的绝对路径引用', () => {
    const result = resolveWikiTarget('/sub/deep/ideas', workspacePath, 'D:/notes/index.md', tree)
    expect(result.resolved).toBe(true)
    expect(result.path).toBe('D:/notes/sub/deep/ideas.md')
  })

  it('引用兄弟目录文件（含子路径）', () => {
    const result = resolveWikiTarget('deep/ideas', workspacePath, 'D:/notes/sub/note.md', tree)
    expect(result.resolved).toBe(true)
    expect(result.path).toBe('D:/notes/sub/deep/ideas.md')
  })

  it('不存在的 target 返回未解析', () => {
    const result = resolveWikiTarget('nonexistent', workspacePath, 'D:/notes/index.md', tree)
    expect(result.resolved).toBe(false)
  })

  it('L19:子目录路径大小写不敏感匹配（Windows 路径大小写不敏感）', () => {
    // 目录段 Sub 大小写不符，文件名也不一致——精确匹配与文件名兜底都失效
    const result = resolveWikiTarget('Sub/NOTE', workspacePath, 'D:/notes/index.md', tree)
    expect(result.resolved).toBe(true)
    expect(result.path).toBe('D:/notes/sub/note.md')

    // 根目录直接引用 + 文件名大小写不符
    const result2 = resolveWikiTarget('TODO.md', workspacePath, 'D:/notes/index.md', tree)
    expect(result2.resolved).toBe(true)
    expect(result2.path).toBe('D:/notes/todo.md')
  })

  it('空 target 返回未解析', () => {
    const result = resolveWikiTarget('', workspacePath, 'D:/notes/index.md', tree)
    expect(result.resolved).toBe(false)
  })
})

describe('createWikiIndexResolver（索引化解析与逐树解析结果一致）', () => {
  const tree: FolderTreeNode[] = [
    { name: 'index.md', path: 'D:/notes/index.md' },
    { name: 'todo.md', path: 'D:/notes/todo.md' },
    { name: 'note#v2.md', path: 'D:/notes/note#v2.md' },
    {
      name: 'sub',
      path: 'D:/notes/sub',
      children: [
        { name: 'note.md', path: 'D:/notes/sub/note.md' },
        { name: 'NOTE.md', path: 'D:/notes/sub/deep/NOTE.md' },
        {
          name: 'deep',
          path: 'D:/notes/sub/deep',
          children: [
            { name: 'ideas.md', path: 'D:/notes/sub/deep/ideas.md' },
            { name: 'index.md', path: 'D:/notes/sub/deep/index.md' },
          ],
        },
      ],
    },
    {
      name: 'projects',
      path: 'D:/notes/projects',
      children: [
        { name: 'readme.md', path: 'D:/notes/projects/readme.md' },
        { name: 'note.md', path: 'D:/notes/projects/note.md' },
      ],
    },
  ]
  const workspacePath = 'D:/notes'
  const resolver = createWikiIndexResolver(tree, workspacePath)

  // 覆盖：文件名、路径、大小写、锚点、绝对路径、根路径、向上查找、
  // index.md、同名多候选、未解析目标
  const targets = [
    'todo', 'todo.md', 'TODO.md', 'todo#章节', 'todo#^abc', 'note#v2', 'note#v2.md',
    'note', 'Note', 'sub/note', 'Sub/NOTE', 'projects/note', 'projects/readme',
    'sub/deep/ideas', 'ideas', 'deep', 'sub/deep', '/todo', '/projects/readme',
    '/sub/deep/ideas.md', './todo', '../todo', 'sub/../todo',
    'D:/notes/todo.md', 'D:/Notes/Todo.md', 'D:/notes/sub/deep/index.md',
    '不存在', 'missing/note', 'note#v2#more', '', 'a^b',
  ]
  const currentFiles = [
    undefined,
    'D:/notes/index.md',
    'D:/notes/sub/note.md',
    'D:/notes/sub/deep/ideas.md',
    'D:/notes/projects/readme.md',
  ]

  it.each(targets.flatMap((t) => currentFiles.map((f) => [t, f] as const)))(
    'target=%j currentFile=%j',
    (target, currentFile) => {
      const expected = resolveWikiTarget(target, workspacePath, currentFile, tree)
      const actual = resolver.resolve(target, currentFile)
      expect(actual).toEqual(expected)
    },
  )

  it('大库性能：2000 节点 × 5000 目标解析应在数百毫秒内完成（回归护栏）', () => {
    const bigTree: FolderTreeNode[] = []
    for (let i = 0; i < 100; i++) {
      bigTree.push({
        name: `folder${i}`,
        path: `D:/big/folder${i}`,
        children: Array.from({ length: 20 }, (_, j) => ({
          name: `file${j}.md`,
          path: `D:/big/folder${i}/file${j}.md`,
        })),
      })
    }
    const bigResolver = createWikiIndexResolver(bigTree, 'D:/big')
    const start = performance.now()
    for (let i = 0; i < 5000; i++) {
      bigResolver.resolve(`folder${i % 100}/file${i % 20}`, 'D:/big/folder0/file0.md')
    }
    const elapsed = performance.now() - start
    // 逐树版本此负载约为分钟级；索引版应远低于 1 秒
    expect(elapsed).toBeLessThan(1000)
  })
})
