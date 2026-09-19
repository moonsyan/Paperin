import { describe, expect, it } from 'vitest'
import {
  parseWorkspaceDocuments,
  parseWorkspaceLayout,
  parseWorkspaceSettings,
  normalizeWorkspaceRelativePath,
} from './workspace-state'

describe('工作区状态校验', () => {
  it('把旧侧栏视图迁移到右侧上下文面板', () => {
    const files = parseWorkspaceLayout({
      schemaVersion: 1,
      sidebar: { width: 290, activeView: 'files', collapsedDirectories: [] },
    })
    const links = parseWorkspaceLayout({
      schemaVersion: 1,
      sidebar: { width: 290, activeView: 'links', collapsedDirectories: [] },
    })

    expect(files.schemaVersion).toBe(2)
    expect(files.sidebar.activeView).toBe('files')
    expect(files.contextDock).toEqual({ visibility: 'expanded', panel: 'outline', width: 312, compact: false })
    expect(links.contextDock?.panel).toBe('links')
  })

  it('解析合法上下文面板并对非法值使用默认值', () => {
    const parsed = parseWorkspaceLayout({
      schemaVersion: 2,
      sidebar: { width: 290, activeView: 'files', collapsedDirectories: [] },
      contextDock: { width: 380, visibility: 'collapsed', panel: 'quality', compact: false },
    })
    const invalid = parseWorkspaceLayout({
      schemaVersion: 2,
      sidebar: { width: 290, activeView: 'files', collapsedDirectories: [] },
      contextDock: { width: 9999, visibility: 'broken', panel: '../unknown', compact: false },
    })
    // compact 是独立布尔位：合法持久化值被保留（旧数据缺省 false）
    const compacted = parseWorkspaceLayout({
      schemaVersion: 2,
      sidebar: { width: 290, activeView: 'files', collapsedDirectories: [] },
      contextDock: { width: 380, visibility: 'collapsed', panel: 'quality', compact: true },
    })

    expect(parsed.contextDock).toEqual({ visibility: 'collapsed', panel: 'quality', width: 380, compact: false })
    expect(invalid.contextDock).toEqual({ visibility: 'expanded', panel: 'outline', width: 312, compact: false })
    expect(compacted.contextDock?.compact).toBe(true)
  })

  it('保留安全的自定义上下文面板 ID', () => {
    const parsed = parseWorkspaceLayout({
      schemaVersion: 2,
      sidebar: { width: 290, activeView: 'files', collapsedDirectories: [] },
      contextDock: { width: 312, visibility: 'expanded', panel: 'plugin.details', compact: false },
    })
    expect(parsed.contextDock?.panel).toBe('plugin.details')
  })

  it('拒绝绝对路径和父目录越界路径', () => {
    expect(normalizeWorkspaceRelativePath('C:\\notes\\a.md')).toBeNull()
    expect(normalizeWorkspaceRelativePath('/notes/a.md')).toBeNull()
    expect(normalizeWorkspaceRelativePath('../secret.md')).toBeNull()
    expect(normalizeWorkspaceRelativePath('docs/../../secret.md')).toBeNull()
    expect(normalizeWorkspaceRelativePath('docs\\a.md')).toBe('docs/a.md')
  })

  it('限制标签和折叠目录数量并去除重复路径', () => {
    const tabs = Array.from({ length: 205 }, (_, index) => ({
      path: `docs/${index}.md`,
      pinned: index === 0,
    }))
    tabs.splice(1, 0, { path: 'docs/0.md', pinned: false })
    const collapsedDirectories = Array.from(
      { length: 2005 },
      (_, index) => `folder/${index}`,
    )
    collapsedDirectories.splice(1, 0, 'folder/0')

    const layout = parseWorkspaceLayout({
      schemaVersion: 1,
      tabs,
      activeTab: 'docs/0.md',
      sidebar: {
        width: 290,
        activeView: 'files',
        collapsedDirectories,
      },
    })

    expect(layout.tabs).toHaveLength(200)
    expect(layout.tabs.filter((tab) => tab.path === 'docs/0.md')).toHaveLength(1)
    expect(layout.sidebar.collapsedDirectories).toHaveLength(2000)
    expect(
      layout.sidebar.collapsedDirectories.filter((path) => path === 'folder/0'),
    ).toHaveLength(1)
  })

  it('修正无效活动标签和侧栏配置', () => {
    const layout = parseWorkspaceLayout({
      schemaVersion: 1,
      tabs: [{ path: 'a.md', pinned: false, secret: 'drop' }],
      activeTab: 'missing.md',
      sidebar: {
        width: 99999,
        activeView: 'bad',
        collapsedDirectories: [],
      },
    })

    expect(layout).toEqual({
      schemaVersion: 2,
      tabs: [{ path: 'a.md', pinned: false }],
      activeTab: null,
      sidebar: {
        width: 600,
        activeView: 'files',
        collapsedDirectories: [],
      },
      contextDock: { visibility: 'expanded', panel: 'outline', width: 312, compact: false },
    })
  })

  it('保留全部五个合法侧栏视图（含 quality，防止持久化回归）', () => {
    for (const activeView of ['files', 'outline', 'links', 'tags', 'quality'] as const) {
      const layout = parseWorkspaceLayout({
        schemaVersion: 1,
        tabs: [],
        activeTab: null,
        sidebar: { width: 290, activeView, collapsedDirectories: [] },
      })
      expect(layout.sidebar.activeView).toBe('files')
      expect(layout.contextDock?.panel).toBe(activeView === 'files' ? 'outline' : activeView)
    }
  })

  it('只保留最近使用的 500 条有效文档状态', () => {
    const documents = Object.fromEntries(
      Array.from({ length: 505 }, (_, index) => [
        `docs/${index}.md`,
        {
          selection: { anchor: index, head: index + 1 },
          scrollTop: index,
          updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        },
      ]),
    )

    const parsed = parseWorkspaceDocuments({ schemaVersion: 1, documents })
    const paths = Object.keys(parsed.documents)

    expect(paths).toHaveLength(500)
    expect(paths).toContain('docs/504.md')
    expect(paths).not.toContain('docs/0.md')
  })

  it('未知主题回退为继承全局主题', () => {
    expect(parseWorkspaceSettings({
      schemaVersion: 1,
      appearance: { theme: '<script>' },
    })).toEqual({
      schemaVersion: 1,
      appearance: { theme: 'inherit' },
      editor: { attachmentDirectory: null, lastSearchQuery: '' },
    })
  })

  it('附件目录缺省为继承全局设置并规范化合法值', () => {
    expect(parseWorkspaceSettings({})).toEqual({
      schemaVersion: 1,
      appearance: { theme: 'inherit' },
      editor: { attachmentDirectory: null, lastSearchQuery: '' },
    })
    expect(parseWorkspaceSettings({ editor: { attachmentDirectory: ' media\\images/ ' } })).toEqual({
      schemaVersion: 1,
      appearance: { theme: 'inherit' },
      editor: { attachmentDirectory: 'media/images', lastSearchQuery: '' },
    })
    expect(parseWorkspaceSettings({ editor: { lastSearchQuery: ' 研究\n笔记 ' } }).editor.lastSearchQuery).toBe('研究 笔记')
    expect(parseWorkspaceSettings({}).editor.lastSearchQuery).toBe('')
  })
})
