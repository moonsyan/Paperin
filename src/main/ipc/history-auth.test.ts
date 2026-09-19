import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { ipcMain } from 'electron'
import { lstat, mkdtemp, rm, symlink, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { CHANNELS } from '../../shared/ipc/channels'
import { registerHistoryHandlers } from './history-handlers'
import { isFileTrustedForSave, isPathTrusted, trustDirectory } from '../trusted-paths'

type CapturedHandler = (
  event: unknown,
  payload: unknown,
) => Promise<{ ok: boolean; error?: { code?: string } }>

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  app: { getPath: vi.fn(() => 'X:/fake-userdata') },
}))

vi.mock('../history/version-store', () => ({
  recordSnapshot: vi.fn(async () => true),
  listSnapshots: vi.fn(async () => []),
  readSnapshot: vi.fn(async () => 'snapshot'),
}))

const handleMock = vi.mocked(ipcMain.handle)
const getHandler = (channel: string): CapturedHandler => {
  const call = handleMock.mock.calls.find(([c]) => c === channel)
  if (!call) throw new Error(`通道未注册：${channel}`)
  return call[1] as CapturedHandler
}

let workspace = ''
let outside = ''

beforeEach(async () => {
  handleMock.mockClear()
  workspace = await mkdtemp(join(tmpdir(), 'mk-hist-in-'))
  outside = await mkdtemp(join(tmpdir(), 'mk-hist-out-'))
  registerHistoryHandlers({
    isTrustedPath: (candidate) => isPathTrusted(candidate as string),
    isFileTrustedForSave,
  })
})

afterAll(async () => {
  await rm(workspace, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('HISTORY 授权必须跟随真实路径', () => {
  it('工作区内指向根外文件的符号链接不能记录快照', async () => {
    trustDirectory(workspace)
    const secret = join(outside, '秘密.md')
    const link = join(workspace, '入口.md')
    await writeFile(secret, '# 根外\n', 'utf-8')
    try {
      await symlink(secret, link, 'file')
    } catch {
      return
    }
    expect((await lstat(link)).isSymbolicLink()).toBe(true)

    const result = await getHandler(CHANNELS.HISTORY_RECORD)({}, { path: link })
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_TARGET' } })
    await unlink(link).catch(() => undefined)
  })
})
