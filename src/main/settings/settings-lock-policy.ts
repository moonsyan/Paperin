export const SETTINGS_LOCK_STALE_MS = 4_000

export const parseSettingsLockPid = (token: string): number | null => {
  const first = token.split('-')[0] ?? ''
  const pid = Number.parseInt(first, 10)
  return Number.isInteger(pid) && pid > 0 && String(pid) === first ? pid : null
}

export const isSettingsLockHolderAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

/**
 * 陈旧锁才能抢；持有进程仍活着时即使超过陈旧阈值也不抢，避免把正在写的
 * settings.json（草稿可能到 30MB）写成两份交织内容。
 */
export const shouldStealSettingsLock = (
  ageMs: number,
  staleMs: number,
  holderPid: number | null,
  isPidAlive: (pid: number) => boolean,
): boolean => {
  if (ageMs <= staleMs) return false
  if (holderPid === null) return true
  return !isPidAlive(holderPid)
}
