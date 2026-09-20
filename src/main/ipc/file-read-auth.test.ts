import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { ipcMain } from 'electron'
import { lstat, mkdtemp, readFile, rm, stat, symlink, unlink, utimes, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { CHANNELS } from '../../shared/ipc/channels'
import { registerFileHandlers } from './file-handlers'
import {
  isFileTrustedForSave,
  isPathTrusted,
  trustDirectory,
  trustFileForSave,
} from '../trusted-paths'

type CapturedHandler = (
  event: unknown,
  payload: unknown,
) => Promise<{ ok: boolean; error?: { code?: string; message?: string }; data?: Record<string, unknown> }>

// 仅替换 electron 表面（同 ipc-input-guards.test.ts）；trusted-paths / file-io 走真实实现
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

let tempDir = ''
let tempDir2 = ''

beforeEach(async () => {
  handleMock.mockClear()
  tempDir = await mkdtemp(join(tmpdir(), 'mk-read-auth-a-'))
  tempDir2 = await mkdtemp(join(tmpdir(), 'mk-read-auth-b-'))
  registerFileHandlers({
    isTrustedPath: (candidate) => isPathTrusted(candidate as string),
  })
})

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true })
  await rm(tempDir2, { recursive: true, force: true })
})

describe('FILE_READ 授权边界（扩展名不再作为授权条件）', () => {
  it('未授信的 .md 路径拒绝读取并返回 NOT_AUTHORIZED', async () => {
    const target = join(tempDir, '任意.md')
    await writeFile(target, '# 秘密\n', 'utf-8')
    const result = await getHandler(CHANNELS.FILE_READ)({}, target)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('NOT_AUTHORIZED')
  })

  it('未授信的非 Markdown 路径同样拒绝（不得绕过）', async () => {
    const target = join(tempDir, 'notes.txt')
    await writeFile(target, 'text', 'utf-8')
    const result = await getHandler(CHANNELS.FILE_READ)({}, target)
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('NOT_AUTHORIZED')
  })

  it('文件级白名单中的路径可读取', async () => {
    const target = join(tempDir, '已打开.md')
    await writeFile(target, '# 已打开\n', 'utf-8')
    await trustFileForSave(target)
    const result = await getHandler(CHANNELS.FILE_READ)({}, target)
    expect(result.ok).toBe(true)
    expect(result.data?.content).toBe('# 已打开\n')
  })

  it('文件级白名单目标消失后立即失效', async () => {
    const target = join(tempDir, '已移除.md')
    await writeFile(target, '# 原始内容\n', 'utf-8')
    await trustFileForSave(target)
    await unlink(target)

    await expect(isFileTrustedForSave(target)).resolves.toBe(false)
  })

  it('文件级白名单路径被替换为根外链接后拒绝读取', async () => {
    const target = join(tempDir, '已授权.md')
    const outside = join(tempDir2, '根外.md')
    await writeFile(target, '# 原始内容\n', 'utf-8')
    await writeFile(outside, '# 根外内容\n', 'utf-8')
    await trustFileForSave(target)
    await unlink(target)

    try {
      await symlink(outside, target, 'file')
    } catch {
      // 当前账户未获创建符号链接的系统权限时，无法构造此 OS 级攻击路径。
      return
    }
    expect((await lstat(target)).isSymbolicLink()).toBe(true)

    const result = await getHandler(CHANNELS.FILE_READ)({}, target)

    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_AUTHORIZED' } })
  })

  it('信任根内路径可读取；非法入参返回 INVALID_PATH', async () => {
    const { trustDirectory } = await import('../trusted-paths')
    trustDirectory(tempDir2)
    const target = join(tempDir2, '工作区.md')
    await writeFile(target, '# 工作区\n', 'utf-8')
    const result = await getHandler(CHANNELS.FILE_READ)({}, target)
    expect(result.ok).toBe(true)
    await expect(getHandler(CHANNELS.FILE_READ)({}, '')).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_PATH' },
    })
  })
})

describe('FILE_READ_DROPPED（拖拽来源经 webUtils 解析后的一次性授权读取）', () => {
  it('读取真实拖拽路径并授予该文件的保存白名单', async () => {
    const dropped = join(tempDir2, '拖入.md')
    await writeFile(dropped, '# 拖入\n', 'utf-8')
    await expect(isFileTrustedForSave(dropped)).resolves.toBe(false)
    const result = await getHandler(CHANNELS.FILE_READ_DROPPED)({}, dropped)
    expect(result.ok).toBe(true)
    expect(result.data?.content).toBe('# 拖入\n')
    // 读取成功后该精确文件可写回，但目录不获得信任根
    await expect(isFileTrustedForSave(dropped)).resolves.toBe(true)
    expect(isPathTrusted(join(tempDir2, '其它.md'))).toBe(false)
  })

  it('空路径拒绝（预加载层对伪造 File 解析为空时不发起 IPC）', async () => {
    await expect(getHandler(CHANNELS.FILE_READ_DROPPED)({}, '')).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_PATH' },
    })
  })
})

describe('FILE_SAVE 与 FILE_READ 授权联动', () => {
  it('读过的拖入文件可写回；未授信路径保存仍被拒绝', async () => {
    const dropped = join(tempDir2, '联动.md')
    await writeFile(dropped, '# 旧\n', 'utf-8')
    const save = getHandler(CHANNELS.FILE_SAVE)
    // 未授权：拒绝
    await expect(
      save({}, { path: dropped, content: '# 新\n' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_PATH' } })
    // 拖入读取 → 授权写回
    const droppedRead = await getHandler(CHANNELS.FILE_READ_DROPPED)({}, dropped)
    expect(droppedRead.ok).toBe(true)
    const saveResult = await save({}, {
      path: dropped,
      content: '# 新\n',
      expectedMtime: droppedRead.data?.modifiedTime,
      expectedContentHash: droppedRead.data?.contentSha256,
    })
    expect(saveResult.ok).toBe(true)
    await expect(readFile(dropped, 'utf-8')).resolves.toBe('# 新\n')
  })

  it('用户确认覆盖时必须能越过 in-memory 基线冲突', async () => {
    const target = join(tempDir2, '覆盖.md')
    await writeFile(target, '# 打开时\n', 'utf-8')
    const read = await getHandler(CHANNELS.FILE_READ_DROPPED)({}, target)
    expect(read.ok).toBe(true)
    const expectedMtime = read.data?.modifiedTime as number
    await writeFile(target, '# 外部已经改过\n', 'utf-8')
    const save = getHandler(CHANNELS.FILE_SAVE)
    await expect(
      save({}, { path: target, content: '# 我的版本\n', expectedMtime }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    await expect(
      save({}, { path: target, content: '# 我的版本\n', forceOverwrite: true }),
    ).resolves.toMatchObject({ ok: true })
    await expect(readFile(target, 'utf-8')).resolves.toBe('# 我的版本\n')
  })

  it('保留 mtime 的等长外部替换也会 CONFLICT', async () => {
    const target = join(tempDir2, '等长.md')
    const original = '# 打开时内容\n'
    const external = '# 外部等长文\n'
    expect(Buffer.byteLength(original)).toBe(Buffer.byteLength(external))
    await writeFile(target, original, 'utf-8')
    const read = await getHandler(CHANNELS.FILE_READ_DROPPED)({}, target)
    expect(read.ok).toBe(true)
    const expectedMtime = read.data?.modifiedTime as number
    const expectedContentHash = read.data?.contentSha256 as string
    const before = await stat(target)
    await writeFile(target, external, 'utf-8')
    await utimes(target, before.atime, before.mtime)
    const save = getHandler(CHANNELS.FILE_SAVE)
    await expect(
      save({}, { path: target, content: '# 我的版本\n', expectedMtime, expectedContentHash }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    await expect(readFile(target, 'utf-8')).resolves.toBe(external)
  })

  it('工作区内换成链接后，等长保存不会改写链接目标', async () => {
    trustDirectory(tempDir2)
    const target = join(tempDir2, '笔记.md')
    const secret = join(tempDir2, '另一篇.md')
    const original = '打开时正文'
    const hidden = '根外秘密文'
    expect(Buffer.byteLength(original)).toBe(Buffer.byteLength(hidden))
    await writeFile(target, original, 'utf-8')
    await writeFile(secret, hidden, 'utf-8')
    const read = await getHandler(CHANNELS.FILE_READ)({}, target)
    expect(read.ok).toBe(true)
    const before = await stat(target)
    await unlink(target)
    try {
      await symlink(secret, target, 'file')
    } catch {
      await writeFile(target, original, 'utf-8')
      return
    }
    await utimes(secret, before.atime, before.mtime)
    const save = getHandler(CHANNELS.FILE_SAVE)
    await expect(
      save({}, {
        path: target,
        content: '我的新正文',
        expectedMtime: before.mtimeMs,
        expectedContentHash: read.data?.contentSha256,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_AUTHORIZED' } })
    await expect(readFile(secret, 'utf-8')).resolves.toBe(hidden)
  })
})
