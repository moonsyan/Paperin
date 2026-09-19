import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { CHANNELS } from '../../shared/ipc/channels'
import { registerFileHandlers } from './file-handlers'
import { isPathTrusted } from '../trusted-paths'

type CapturedHandler = (
  event: unknown,
  payload?: unknown,
) => Promise<{ ok: boolean; error?: { code?: string }; data?: { name?: string; content?: string } }>

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  app: { getPath: vi.fn(() => 'X:/fake-userdata') },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({ id: 1 })),
  },
  dialog: {
    showOpenDialog: vi.fn(),
  },
  shell: {},
}))

const handleMock = vi.mocked(ipcMain.handle)
const getHandler = (channel: string): CapturedHandler => {
  const call = handleMock.mock.calls.find(([c]) => c === channel)
  if (!call) throw new Error(`通道未注册：${channel}`)
  return call[1] as CapturedHandler
}

let tempDir = ''

beforeEach(async () => {
  handleMock.mockClear()
  vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({ id: 1 } as never)
  tempDir = await mkdtemp(join(tmpdir(), 'mk-css-pick-'))
  registerFileHandlers({
    isTrustedPath: (candidate) => isPathTrusted(candidate as string),
  })
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('FILE_PICK_CSS 授权范围', () => {
  it('读取所选 CSS 后不把所在目录变成信任根', async () => {
    const cssPath = join(tempDir, 'theme.css')
    const sibling = join(tempDir, '秘密.md')
    await writeFile(cssPath, 'body{color:red}', 'utf-8')
    await writeFile(sibling, '# 秘密\n', 'utf-8')
    vi.mocked(dialog.showOpenDialog).mockResolvedValue({
      canceled: false,
      filePaths: [cssPath],
    })

    const picked = await getHandler(CHANNELS.FILE_PICK_CSS)({ sender: { id: 1 } })
    expect(picked.ok).toBe(true)
    expect(picked.data?.content).toContain('body{color:red}')
    expect(isPathTrusted(sibling)).toBe(false)

    const read = await getHandler(CHANNELS.FILE_READ)({ sender: { id: 1 } }, sibling)
    expect(read).toMatchObject({ ok: false, error: { code: 'NOT_AUTHORIZED' } })
  })
})
