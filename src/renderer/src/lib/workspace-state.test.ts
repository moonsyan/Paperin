import { describe, expect, it } from 'vitest'
import type { OpenFile } from '../components/Sidebar'
import {
  updateWorkspaceDocumentView,
  createWorkspaceLayoutSnapshot,
  expandRelativePathsWithAncestors,
  resolveEffectiveTheme,
  resolveWorkspacePath,
  toWorkspaceRelativePath,
} from './workspace-state'

describe('渲染层工作区状态转换', () => {
  it('在布局快照中写入 schema v2 上下文面板状态', () => {
    const snapshot = createWorkspaceLayoutSnapshot({
      rootPath: 'C:\\notes',
      openFiles: [],
      activeFileId: '',
      sidebarWidth: 290,
      sidebarActiveView: 'files',
      collapsedDirectories: [],
      contextDock: { visibility: 'collapsed', panel: 'tags', width: 360, compact: false },
      caseInsensitive: true,
    })

    expect(snapshot.schemaVersion).toBe(2)
    expect(snapshot.contextDock).toEqual({ visibility: 'collapsed', panel: 'tags', width: 360, compact: false })
  })

  it('只把工作区内真实文件写入布局快照', () => {
    const files: OpenFile[] = [
      { id: 'a', name: 'a.md', path: 'C:\\notes\\docs\\a.md', pinned: true },
      { id: 'outside', name: 'b.md', path: 'C:\\other\\b.md' },
      { id: 'untitled', name: '未命名.md' },
    ]

    const snapshot = createWorkspaceLayoutSnapshot({
      rootPath: 'C:\\notes',
      openFiles: files,
      activeFileId: 'a',
      sidebarWidth: 320,
      sidebarActiveView: 'files',
      collapsedDirectories: ['C:\\notes\\docs\\archive', 'C:\\other'],
      expandedDirectories: ['C:\\notes\\docs', 'C:\\other'],
      contextDock: { visibility: 'expanded', panel: 'outline', width: 312, compact: false },
      caseInsensitive: true,
    })

    expect(snapshot.tabs).toEqual([{ path: 'docs/a.md', pinned: true }])
    expect(snapshot.activeTab).toBe('docs/a.md')
    expect(snapshot.sidebar.collapsedDirectories).toEqual(['docs/archive'])
    expect(snapshot.sidebar.expandedDirectories).toEqual(['docs'])
  })

  it('展开记忆为 null 时不写入 expandedDirectories 字段', () => {
    const snapshot = createWorkspaceLayoutSnapshot({
      rootPath: 'C:\\notes',
      openFiles: [],
      activeFileId: '',
      sidebarWidth: 290,
      sidebarActiveView: 'files',
      collapsedDirectories: [],
      expandedDirectories: null,
      caseInsensitive: true,
    })
    expect(snapshot.sidebar.expandedDirectories).toBeUndefined()
  })

  it('主题为 inherit 时使用全局主题', () => {
    expect(resolveEffectiveTheme('dark', 'inherit')).toBe('dark')
    expect(resolveEffectiveTheme('dark', 'rose')).toBe('rose')
  })

  it('安全转换工作区相对路径和绝对路径', () => {
    expect(toWorkspaceRelativePath('D:\\notes', 'D:\\notes\\a.md', true)).toBe('a.md')
    expect(toWorkspaceRelativePath('D:\\notes', 'D:\\other\\a.md', true)).toBeNull()
    expect(resolveWorkspacePath('D:\\notes', 'docs/a.md', 'win32')).toBe(
      'D:\\notes\\docs\\a.md',
    )
    expect(resolveWorkspacePath('/notes', '../secret.md', 'linux')).toBeNull()
  })

  it('展开记忆相对路径补全祖先并按深度排序', () => {
    expect(expandRelativePathsWithAncestors(['docs/api', 'docs'])).toEqual([
      'docs',
      'docs/api',
    ])
    expect(expandRelativePathsWithAncestors(['a/b/c'])).toEqual(['a', 'a/b', 'a/b/c'])
    expect(expandRelativePathsWithAncestors(['../evil', ''])).toEqual([])
  })

  it('只记录工作区内真实文件的视图状态', () => {
    const initial = { schemaVersion: 1 as const, documents: {} }
    const viewState = {
      selection: { anchor: 12, head: 18 },
      scrollTop: 320,
    }

    const updated = updateWorkspaceDocumentView({
      state: initial,
      rootPath: 'C:\\notes',
      filePath: 'C:\\notes\\docs\\a.md',
      viewState,
      updatedAt: '2026-08-19T08:00:00.000Z',
      caseInsensitive: true,
    })

    expect(updated.documents).toEqual({
      'docs/a.md': {
        ...viewState,
        updatedAt: '2026-08-19T08:00:00.000Z',
      },
    })
    expect(updateWorkspaceDocumentView({
      state: updated,
      rootPath: 'C:\\notes',
      filePath: 'C:\\other\\b.md',
      viewState,
      updatedAt: '2026-08-19T08:01:00.000Z',
      caseInsensitive: true,
    })).toBe(updated)
  })
})
