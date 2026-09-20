import { createHash } from 'crypto'
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import { registerFileHandlers } from './file-handlers'
import { trustFileForSave } from '../trusted-paths'
import { forgetKnownFileState } from './file-io'

type CapturedHandler = (
  event: unknown,
  payload: unknown,
) => Promise<{ ok: boolean; error?: { code?: string; message?: string }; data?: Record<string, unknown> }>

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

const sha256Hex = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex')

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'paperin-doc-save-'))
  temporaryDirectories.push(directory)
  return directory
}

beforeEach(() => {
  handleMock.mockClear()
  registerFileHandlers({ isTrustedPath: () => true })
})

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('document-save-handler 双读取者版本绑定', () => {
  it.each([0, 1, 200, 499, 500, 501] as const)(
    'A 写入后 B 以旧版本保存必须 CONFLICT（mtime 差值 %i ms，等长内容）',
    async (deltaMs) => {
      const directory = await createTemporaryDirectory()
      const target = join(directory, '共享.md')
      const original = '正文AAAA' // 等长
      const fromA = '正文BBBB'
      expect(Buffer.byteLength(original)).toBe(Buffer.byteLength(fromA))
      await writeFile(target, original, 'utf-8')
      await trustFileForSave(target)

      const read = getHandler(CHANNELS.FILE_READ)
      const save = getHandler(CHANNELS.FILE_SAVE)

      const readerB = await read({}, target)
      expect(readerB.ok).toBe(true)
      const versionB = {
        expectedMtime: readerB.data!.modifiedTime as number,
        expectedContentHash: readerB.data!.contentSha256 as string,
      }
      expect(versionB.expectedContentHash).toBe(sha256Hex(original))

      // A 读取并写入（更新进程全局 known）
      const readerA = await read({}, target)
      expect(readerA.ok).toBe(true)
      const saveA = await save({}, {
        path: target,
        content: fromA,
        expectedMtime: readerA.data!.modifiedTime,
        expectedContentHash: readerA.data!.contentSha256,
      })
      expect(saveA.ok).toBe(true)

      // 把磁盘 mtime 调到相对 B 期望值的指定差值（含 0）
      const afterA = await stat(target)
      const desiredMtimeSec = (versionB.expectedMtime + deltaMs) / 1000
      await utimes(target, afterA.atime, desiredMtimeSec)

      const saveB = await save({}, {
        path: target,
        content: '窗口B想写的',
        expectedMtime: versionB.expectedMtime,
        expectedContentHash: versionB.expectedContentHash,
      })
      expect(saveB).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
      await expect(readFile(target, 'utf-8')).resolves.toBe(fromA)
    },
  )

  it('forceOverwrite 仅在显式确认后允许 B 覆盖 A', async () => {
    const directory = await createTemporaryDirectory()
    const target = join(directory, '覆盖.md')
    await writeFile(target, '打开时', 'utf-8')
    await trustFileForSave(target)
    const read = getHandler(CHANNELS.FILE_READ)
    const save = getHandler(CHANNELS.FILE_SAVE)

    const readerB = await read({}, target)
    const versionB = {
      expectedMtime: readerB.data!.modifiedTime as number,
      expectedContentHash: readerB.data!.contentSha256 as string,
    }

    const readerA = await read({}, target)
    await save({}, {
      path: target,
      content: 'A已写入',
      expectedMtime: readerA.data!.modifiedTime,
      expectedContentHash: readerA.data!.contentSha256,
    })

    await expect(save({}, {
      path: target,
      content: 'B旧版本',
      expectedMtime: versionB.expectedMtime,
      expectedContentHash: versionB.expectedContentHash,
    })).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    await expect(readFile(target, 'utf-8')).resolves.toBe('A已写入')

    const forced = await save({}, {
      path: target,
      content: 'B强制覆盖',
      forceOverwrite: true,
    })
    expect(forced.ok).toBe(true)
    expect(forced.data?.contentSha256).toBe(sha256Hex('B强制覆盖'))
    await expect(readFile(target, 'utf-8')).resolves.toBe('B强制覆盖')
  })

  it('旧会话无 expectedContentHash 时 CONFLICT，不静默用全局 hash', async () => {
    const directory = await createTemporaryDirectory()
    const target = join(directory, '无hash.md')
    await writeFile(target, '原始', 'utf-8')
    await trustFileForSave(target)
    const read = getHandler(CHANNELS.FILE_READ)
    const save = getHandler(CHANNELS.FILE_SAVE)
    const opened = await read({}, target)
    expect(opened.ok).toBe(true)

    await expect(save({}, {
      path: target,
      content: '想保存',
      expectedMtime: opened.data!.modifiedTime,
      // 故意不传 expectedContentHash
    })).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    await expect(readFile(target, 'utf-8')).resolves.toBe('原始')
  })

  it('成功保存回执包含 DocumentFileVersion 字段', async () => {
    const directory = await createTemporaryDirectory()
    const target = join(directory, '回执.md')
    await writeFile(target, 'v1', 'utf-8')
    await trustFileForSave(target)
    const read = getHandler(CHANNELS.FILE_READ)
    const save = getHandler(CHANNELS.FILE_SAVE)
    const opened = await read({}, target)
    const result = await save({}, {
      path: target,
      content: 'v2',
      expectedMtime: opened.data!.modifiedTime,
      expectedContentHash: opened.data!.contentSha256,
    })
    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({
      contentSha256: sha256Hex('v2'),
    })
    expect(typeof result.data?.modifiedTime).toBe('number')
    expect(typeof result.data?.size).toBe('number')
  })

  it('清理已知状态后仍只认请求 hash', async () => {
    const directory = await createTemporaryDirectory()
    const target = join(directory, '忘却.md')
    await writeFile(target, '旧', 'utf-8')
    await trustFileForSave(target)
    const read = getHandler(CHANNELS.FILE_READ)
    const save = getHandler(CHANNELS.FILE_SAVE)
    const opened = await read({}, target)
    forgetKnownFileState(target)
    const result = await save({}, {
      path: target,
      content: '新',
      expectedMtime: opened.data!.modifiedTime,
      expectedContentHash: opened.data!.contentSha256,
    })
    expect(result.ok).toBe(true)
    await expect(readFile(target, 'utf-8')).resolves.toBe('新')
  })
})
