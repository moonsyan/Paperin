import { access, mkdtemp, readFile, rm, utimes, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireCrossProcessSaveLock } from './save-lock'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true })))
})

describe('跨进程保存锁', () => {
  it('释放后删除自己创建的锁文件', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'paperin-save-lock-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, '笔记.md')
    const release = await acquireCrossProcessSaveLock(filePath)

    await release()

    await expect(access(`${filePath}.mkedit-save-lock`)).rejects.toThrow()
  })

  it('过期锁（持有进程已死且超时）被接管且不残留隔离文件', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'paperin-save-lock-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, '笔记.md')
    const lockPath = `${filePath}.mkedit-save-lock`
    const past = new Date(Date.now() - 60_000)
    // 持有进程 999999 视为已死亡（kill(pid,0) 返回 ESRCH）
    await writeFile(lockPath, `999999\n${past.getTime()}\n`, 'utf-8')
    await utimes(lockPath, past, past)

    const release = await acquireCrossProcessSaveLock(filePath)

    // 接管后锁内容是本进程，隔离探针文件不残留
    const raw = await readFile(lockPath, 'utf-8')
    expect(raw.split('\n')[0]).toBe(String(process.pid))
    await release()
    await expect(access(`${lockPath}.stale-${process.pid}`)).rejects.toThrow()
  })
})
