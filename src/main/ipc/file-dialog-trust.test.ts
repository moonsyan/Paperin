import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { CHANNELS } from '../../shared/ipc/channels'
import { registerFileHandlers } from './file-handlers'
import { isFileTrustedForSave, isPathTrusted } from '../trusted-paths'

type CapturedHandler = (
  event: unknown,
  payload?: unknown,
) => Promise<{ ok: boolean; error?: { code?: string }; data?: { modifiedTime?: number } }>

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: vi.fn(() => 'X:/fake-userdata') },
  BrowserWindow: { fromWebContents: vi.fn(() => ({ id: 1 })) },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  shell: {},
}))

const handleMock = vi.mocked(ipcMain.handle)
const getHandler = (channel: string): CapturedHandler => {
  const call = handleMock.mock.calls.find(([registered]) => registered === channel)
  if (!call) throw new Error(`通道未注册：${channel}`)
  return call[1] as CapturedHandler
}

let tempDir = ''

beforeEach(async () => {
  handleMock.mockClear()
  vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({ id: 1 } as never)
  tempDir = await mkdtemp(join(tmpdir(), 'paperin-dialog-trust-'))
  registerFileHandlers({
    isTrustedPath: (candidate) => isPathTrusted(candidate as string),
  })
})

afterAll(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('打开和另存为不升级父目录写权限', () => {
  it('打开单个 Markdown 后不能读写同目录的其他文件', async () => {
    const chosen = join(tempDir, '笔记.md')
    const sibling = join(tempDir, '秘密.md')
    await writeFile(chosen, '# 笔记\n', 'utf-8')
    await writeFile(sibling, '# 秘密\n', 'utf-8')
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: [chosen] })

    const opened = await getHandler(CHANNELS.FILE_OPEN)({ sender: { id: 1 } })
    expect(opened.ok).toBe(true)
    expect(isPathTrusted(sibling)).toBe(false)
    await expect(isFileTrustedForSave(chosen)).resolves.toBe(true)
    await expect(getHandler(CHANNELS.FILE_READ)({ sender: { id: 1 } }, sibling)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_AUTHORIZED' },
    })
  })

  it('另存为只授权刚写出的文件', async () => {
    const target = join(tempDir, '副本.md')
    const sibling = join(tempDir, '秘密.md')
    await writeFile(sibling, '# 秘密\n', 'utf-8')
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({ canceled: false, filePath: target })

    const saved = await getHandler(CHANNELS.FILE_SAVE_AS)({ sender: { id: 1 } }, { content: '# 副本\n' })
    expect(saved.ok).toBe(true)
    await expect(readFile(target, 'utf-8')).resolves.toBe('# 副本\n')
    expect(isPathTrusted(sibling)).toBe(false)
    await expect(isFileTrustedForSave(target)).resolves.toBe(true)
    await expect(getHandler(CHANNELS.FILE_READ)({ sender: { id: 1 } }, sibling)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_AUTHORIZED' },
    })
  })
})
