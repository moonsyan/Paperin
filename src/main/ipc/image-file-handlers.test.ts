import { mkdtemp, rm, symlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain, shell } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import { allowImageDirectory } from '../image-protocol'
import { isPathTrusted, trustDirectory } from '../trusted-paths'
import { registerImageFileHandlers } from './image-file-handlers'

vi.mock('electron', () => ({
  app: { getPath: () => 'X:/fake-userdata' },
  ipcMain: { handle: vi.fn() },
  net: {},
  shell: { trashItem: vi.fn() },
}))

type CapturedHandler = (event: unknown, payload: unknown) => Promise<{
  ok: boolean
  error?: { code?: string }
}>

const handleMock = vi.mocked(ipcMain.handle)
const trashItemMock = vi.mocked(shell.trashItem)
const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (prefix: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

const getHandler = (channel: string): CapturedHandler => {
  const call = handleMock.mock.calls.find(([registeredChannel]) => registeredChannel === channel)
  if (!call) throw new Error(`通道未注册：${channel}`)
  return call[1] as CapturedHandler
}

beforeEach(() => {
  handleMock.mockClear()
  trashItemMock.mockClear()
  registerImageFileHandlers({ isTrustedPath: (candidate) => isPathTrusted(String(candidate)) })
})

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('图片文件 IPC 的真实路径授权', () => {
  it('工作区附件目录被替换为根外链接时，拒绝保存图片', async () => {
    const workspace = await createTemporaryDirectory('paperin-image-workspace-')
    const outside = await createTemporaryDirectory('paperin-image-outside-')
    const document = join(workspace, '笔记.md')
    const attachments = join(workspace, 'attachments')
    await writeFile(document, '# 笔记\n')
    try {
      await symlink(outside, attachments, 'junction')
    } catch {
      return
    }
    trustDirectory(workspace)

    const result = await getHandler(CHANNELS.FILE_SAVE_IMAGE)({}, {
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      docPath: document,
      workspacePath: workspace,
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_PATH' } })
  })

  it('工作区图片目录被替换为根外链接时，拒绝枚举和删除', async () => {
    const workspace = await createTemporaryDirectory('paperin-image-list-workspace-')
    const outside = await createTemporaryDirectory('paperin-image-list-outside-')
    const attachments = join(workspace, 'attachments')
    const image = join(outside, '秘密.png')
    await writeFile(image, '根外图片')
    try {
      await symlink(outside, attachments, 'junction')
    } catch {
      return
    }
    trustDirectory(workspace)

    await expect(getHandler(CHANNELS.FILE_LIST_IMAGES)({}, [attachments])).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_ARGUMENT' },
    })
    await expect(getHandler(CHANNELS.FILE_DELETE_IMAGE)({}, join(attachments, '秘密.png'))).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_PATH' },
    })
    expect(trashItemMock).not.toHaveBeenCalled()
  })

  it('仅有图片读取白名单时拒绝保存和删除图片', async () => {
    const dropped = await createTemporaryDirectory('paperin-image-drop-')
    const document = join(dropped, '外部.md')
    await writeFile(document, '# 拖入\n')
    allowImageDirectory(dropped)

    const save = await getHandler(CHANNELS.FILE_SAVE_IMAGE)({}, {
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      docPath: document,
    })
    expect(save).toMatchObject({ ok: false, error: { code: 'INVALID_PATH' } })

    const image = join(dropped, 'attachments', 'shot.png')
    await expect(getHandler(CHANNELS.FILE_DELETE_IMAGE)({}, image)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_PATH' },
    })
    expect(trashItemMock).not.toHaveBeenCalled()
  })
})
