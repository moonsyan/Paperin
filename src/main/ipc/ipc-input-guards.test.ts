import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import type { FileHandlerDependencies } from './file-handlers'
import { registerFileHandlers } from './file-handlers'
import { registerImageFileHandlers } from './image-file-handlers'
import { registerImageHostHandlers } from './image-host-handlers'

type CapturedHandler = (event: unknown, payload: unknown) => Promise<{
  ok: boolean
  error?: { code?: string }
}>

// 仅替换 electron 表面：注册捕获 + 未触达的最小桩。
// 各业务模块（trusted-paths/settings-store 等）导入无顶层副作用，可走真实实现。
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  app: { getPath: vi.fn(() => 'X:/fake-userdata') },
  BrowserWindow: class {},
  dialog: {},
  shell: {},
}))

const handleMock = vi.mocked(ipcMain.handle)

const getHandler = (channel: string): CapturedHandler => {
  const call = handleMock.mock.calls.find(([c]) => c === channel)
  if (!call) throw new Error(`通道未注册：${channel}`)
  return call[1] as CapturedHandler
}

describe('IPC 入参形状守卫：畸形载荷返回 INVALID_ARGUMENT 而非未分类异常', () => {
  beforeEach(() => {
    handleMock.mockClear()
    const deps: FileHandlerDependencies = { isTrustedPath: () => false }
    registerFileHandlers(deps)
    registerImageHostHandlers()
  })

  describe('FILE_SAVE_IMAGE', () => {
    it.each([
      ['null 载荷', null],
      ['非对象载荷', 'data:image/png;base64,eCnp'],
      ['缺少 dataUrl', {}],
      ['dataUrl 非字符串', { dataUrl: 123 }],
      ['docPath 非字符串', { dataUrl: '', docPath: 1 }],
    ])('%s返回 INVALID_ARGUMENT', async (_label, payload) => {
      await expect(getHandler(CHANNELS.FILE_SAVE_IMAGE)({}, payload)).resolves.toEqual({
        ok: false,
        error: { code: 'INVALID_ARGUMENT' },
      })
    })

    it('形状合法但非图片 data URL 时放行到语义层返回 UNSUPPORTED（不误伤）', async () => {
      await expect(
        getHandler(CHANNELS.FILE_SAVE_IMAGE)({}, { dataUrl: 'not-a-data-url' }),
      ).resolves.toEqual({ ok: false, error: { code: 'UNSUPPORTED' } })
    })
  })

  describe('IMAGE_UPLOAD', () => {
    it.each([
      ['null 载荷', null],
      ['缺少 dataUrl', {}],
      ['dataUrl 非字符串', { dataUrl: [] }],
    ])('%s返回 INVALID_ARGUMENT', async (_label, payload) => {
      await expect(getHandler(CHANNELS.IMAGE_UPLOAD)({}, payload)).resolves.toEqual({
        ok: false,
        error: { code: 'INVALID_ARGUMENT' },
      })
    })

    it('形状合法但非图片 data URL 时放行到语义层返回 UNSUPPORTED（不误伤）', async () => {
      await expect(
        getHandler(CHANNELS.IMAGE_UPLOAD)({}, { dataUrl: 'nope' }),
      ).resolves.toEqual({ ok: false, error: { code: 'UNSUPPORTED' } })
    })
  })
})

describe('图片文件 IPC 注册边界', () => {
  it('注册保存、列举和删除图片三个通道', () => {
    registerImageFileHandlers({ isTrustedPath: () => false })

    const channels = handleMock.mock.calls.map(([channel]) => channel)

    expect(channels).toContain(CHANNELS.FILE_SAVE_IMAGE)
    expect(channels).toContain(CHANNELS.FILE_LIST_IMAGES)
    expect(channels).toContain(CHANNELS.FILE_DELETE_IMAGE)
  })
})
