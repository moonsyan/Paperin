import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  DEFAULT_WORKSPACE_SETTINGS,
  type WorkspaceLayoutState,
} from '../../shared/workspace-state'
import { WorkspaceStateStore } from './workspace-state-store'

describe('工作区状态存储', () => {
  let rootPath = ''
  let statePath = ''

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'paperin-workspace-state-'))
    statePath = join(rootPath, '.paperin')
    await mkdir(statePath)
  })

  afterEach(async () => {
    await rm(rootPath, { recursive: true, force: true })
  })

  it('单个 JSON 损坏时只回退对应状态', async () => {
    const validLayout: WorkspaceLayoutState = {
      schemaVersion: 1,
      tabs: [{ path: 'docs/a.md', pinned: true }],
      activeTab: 'docs/a.md',
      sidebar: {
        width: 320,
        activeView: 'outline',
        collapsedDirectories: ['docs/archive'],
      },
    }
    await writeFile(join(statePath, 'settings.json'), '{broken', 'utf-8')
    await writeFile(
      join(statePath, 'workspace.json'),
      JSON.stringify(validLayout),
      'utf-8',
    )

    const bundle = await new WorkspaceStateStore().load(rootPath)

    expect(bundle.settings).toEqual(DEFAULT_WORKSPACE_SETTINGS)
    expect(bundle.layout).toEqual({
      ...validLayout,
      schemaVersion: 2,
      sidebar: { ...validLayout.sidebar, activeView: 'files' },
      contextDock: { width: 312, visibility: 'expanded', panel: 'outline', compact: false },
    })
    expect(bundle.documents.documents).toEqual({})
  })

  it('超过 1MB 的单个状态文件回退默认值', async () => {
    await writeFile(
      join(statePath, 'workspace.json'),
      JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }),
      'utf-8',
    )

    const bundle = await new WorkspaceStateStore().load(rootPath)

    expect(bundle.layout.tabs).toEqual([])
    expect(bundle.layout.activeTab).toBeNull()
  })

  it('连续写入同一文件时最终保留最新状态', async () => {
    const store = new WorkspaceStateStore()
    const firstLayout: WorkspaceLayoutState = {
      schemaVersion: 1,
      tabs: [{ path: 'first.md', pinned: false }],
      activeTab: 'first.md',
      sidebar: {
        width: 280,
        activeView: 'files',
        collapsedDirectories: [],
      },
    }
    const secondLayout: WorkspaceLayoutState = {
      ...firstLayout,
      tabs: [{ path: 'second.md', pinned: true }],
      activeTab: 'second.md',
    }

    await Promise.all([
      store.writeLayout(rootPath, firstLayout),
      store.writeLayout(rootPath, secondLayout),
    ])

    expect((await store.load(rootPath)).layout).toEqual({
      ...secondLayout,
      schemaVersion: 2,
      contextDock: { width: 312, visibility: 'expanded', panel: 'outline', compact: false },
    })
    expect(JSON.parse(await readFile(join(statePath, 'workspace.json'), 'utf-8'))).toEqual({
      ...secondLayout,
      schemaVersion: 2,
      contextDock: { width: 312, visibility: 'expanded', panel: 'outline', compact: false },
    })
  })

  it('并发的原子更新按序合并，互不覆盖对方字段', async () => {
    const store = new WorkspaceStateStore()
    // 模拟两个窗口各自"读-改-写"不同字段：updater 内制造 await 交错点
    await Promise.all([
      store.updateSettings(rootPath, async (current) => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return { ...current, editor: { attachmentDirectory: 'from-a' } }
      }),
      store.updateSettings(rootPath, (current) => ({
        ...current,
        appearance: { theme: 'dark' },
      })),
    ])

    const settings = (await store.load(rootPath)).settings
    expect(settings.editor.attachmentDirectory).toBe('from-a')
    expect(settings.appearance.theme).toBe('dark')
  })

})
