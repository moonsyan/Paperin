import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ipcMain, shell } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { CHANNELS } from '../../shared/ipc/channels'
import { registerWorkspaceHandlers } from './workspace-handlers'
import { isPathTrusted, trustDirectory } from '../trusted-paths'

type CapturedHandler = (
  event: { sender: { id: number } },
  payload: unknown,
) => Promise<{ ok: boolean; error?: { code?: string } }>

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(() => 'X:/fake-userdata') },
  BrowserWindow: {},
  dialog: {},
  shell: { trashItem: vi.fn() },
}))

const handleMock = vi.mocked(ipcMain.handle)
const trashItemMock = vi.mocked(shell.trashItem)
const getHandler = (channel: string): CapturedHandler => {
  const call = handleMock.mock.calls.find(([registered]) => registered === channel)
  if (!call) throw new Error(`通道未注册：${channel}`)
  return call[1] as CapturedHandler
}

let workspace = ''

beforeEach(async () => {
  handleMock.mockClear()
  trashItemMock.mockClear()
  workspace = await mkdtemp(join(tmpdir(), 'paperin-mutation-recheck-'))
  trustDirectory(workspace)
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

describe('工作区改写前再次授权', () => {
  it('删除前工作区根消失时不进回收站', async () => {
    const filePath = join(workspace, '笔记.md')
    await writeFile(filePath, '# 笔记\n', 'utf-8')
    let checks = 0
    registerWorkspaceHandlers({
      hasWorkspaceRoot: () => true,
      setWorkspaceRoot: () => {},
      clearWorkspaceRoot: () => {},
      workspaceRootFor: () => {
        checks += 1
        return checks === 1 ? workspace : null
      },
      isTrustedPath: (candidate) => isPathTrusted(candidate as string),
    })

    const result = await getHandler(CHANNELS.FILE_DELETE)({ sender: { id: 1 } }, filePath)
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_PATH' } })
    expect(trashItemMock).not.toHaveBeenCalled()
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('# 笔记\n')
  })
})
