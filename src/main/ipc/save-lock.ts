import { open, readFile, rename, stat, unlink } from 'fs/promises'

const SAVE_LOCK_STALE_MS = 10_000
const SAVE_LOCK_WAIT_MS = 30_000
const SAVE_LOCK_POLL_MS = 60

/** 锁目录不可写等真实 IO 错误：与"未能拿到锁"区分，
 *  调用方按类型识别而非比较 message 文案（文案调整不应改变错误分类） */
export class SaveLockIoError extends Error {
  constructor() {
    super('SAVE_ERROR')
    this.name = 'SaveLockIoError'
  }
}

export const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

export const acquireCrossProcessSaveLock = async (
  filePath: string,
): Promise<() => Promise<void>> => {
  const lockPath = `${filePath}.mkedit-save-lock`
  const deadline = Date.now() + SAVE_LOCK_WAIT_MS

  for (;;) {
    try {
      const handle = await open(lockPath, 'wx')
      try {
        await handle.writeFile(`${process.pid}\n${Date.now()}\n`)
      } finally {
        await handle.close()
      }
      return async () => {
        try {
          const raw = await readFile(lockPath, 'utf-8')
          if (raw.split('\n')[0] === String(process.pid)) {
            await unlink(lockPath)
            return
          }
          console.warn('[save-lock] 释放时锁已易主，存在并发保存风险')
        } catch {
          // 锁文件已不存在时无需处理。
        }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EEXIST') {
        try {
          await stat(lockPath)
        } catch {
          throw new SaveLockIoError()
        }
      }

      // 就地检查锁文件，不得把仍在使用的锁 rename 走再移回：rename 走开
      // 的窗口内第三方进程可以 wx 成功拿到锁，回写会把新持有者的锁整个
      // 覆盖，造成两个进程同时认为持锁、并发写盘。只有确认过期
      // （超时且持有进程已死）才把锁隔离移除。
      let stale = false
      try {
        const [raw, lockStat] = await Promise.all([
          readFile(lockPath, 'utf-8').catch(() => ''),
          stat(lockPath),
        ])
        const holderPid = Number.parseInt(raw.split('\n')[0] ?? '', 10)
        stale = Date.now() - lockStat.mtimeMs > SAVE_LOCK_STALE_MS && !isProcessAlive(holderPid)
      } catch {
        // 检查期间锁被持有者正常释放：下一轮直接竞争。
      }
      if (stale) {
        const probe = `${lockPath}.stale-${process.pid}`
        await rename(lockPath, probe).catch(() => {})
        await unlink(probe).catch(() => {})
        continue
      }
      if (Date.now() >= deadline) throw new Error('SAVE_LOCK_TIMEOUT')
      await new Promise((resolve) => setTimeout(resolve, SAVE_LOCK_POLL_MS))
    }
  }
}
