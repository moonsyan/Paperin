import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const userDataDir = vi.hoisted(() => ({ path: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return userDataDir.path
      return userDataDir.path
    },
  },
}))

describe('settings-store 草稿会话', () => {
  beforeEach(async () => {
    userDataDir.path = await mkdtemp(join(tmpdir(), 'paperin-settings-draft-'))
  })

  afterEach(async () => {
    if (userDataDir.path) {
      await rm(userDataDir.path, { recursive: true, force: true })
    }
  })

  it('同一路径：第二窗口 session 写入被拒绝且保留第一窗口草稿', async () => {
    const { upsertDraft, SettingsStoreError } = await import('./settings-store')
    await upsertDraft('file-a', '窗口 A 编辑', undefined, 'sess-a')
    await expect(upsertDraft('file-a', '窗口 B 覆盖', undefined, 'sess-b')).rejects.toBeInstanceOf(
      SettingsStoreError,
    )
    await expect(upsertDraft('file-a', '窗口 B 覆盖', undefined, 'sess-b')).rejects.toMatchObject({
      code: 'DRAFT_SESSION_CONFLICT',
    })
    const raw = JSON.parse(await readFile(join(userDataDir.path, 'settings.json'), 'utf-8')) as {
      drafts: Record<string, { content: string; draftSessionId?: string }>
    }
    expect(raw.drafts['file-a'].content).toBe('窗口 A 编辑')
    expect(raw.drafts['file-a'].draftSessionId).toBe('sess-a')
  })

  it('遗留无 draftSessionId 的草稿条目不被清空', async () => {
    const { upsertDraft } = await import('./settings-store')
    await upsertDraft('legacy', '升级前草稿')
    const rawBefore = JSON.parse(await readFile(join(userDataDir.path, 'settings.json'), 'utf-8')) as {
      drafts: Record<string, { content: string; draftSessionId?: string }>
    }
    expect(rawBefore.drafts.legacy.content).toBe('升级前草稿')
    expect(rawBefore.drafts.legacy.draftSessionId).toBeUndefined()
    await upsertDraft('legacy', '认领后', undefined, 'sess-new')
    const rawAfter = JSON.parse(await readFile(join(userDataDir.path, 'settings.json'), 'utf-8')) as {
      drafts: Record<string, { content: string; draftSessionId?: string }>
    }
    expect(rawAfter.drafts.legacy.content).toBe('认领后')
    expect(rawAfter.drafts.legacy.draftSessionId).toBe('sess-new')
  })
})
