import { useEffect } from 'react'

// 关窗流程（主进程 destroy() 不触发 beforeunload）前统一写回防抖未落盘的
// 设置项；每个防抖 hook 实例注册一个 flusher，重复注册由 Set 去重失效后重挂
const pendingFlushers = new Set<() => void | Promise<void>>()

/** 立即写回所有防抖未落盘的持久化设置（关窗/退出前调用） */
export const flushPersistedSettings = async (): Promise<void> => {
  await Promise.all(Array.from(pendingFlushers).map(async (flush) => {
    try {
      await flush()
    } catch {
      // 单项失败不阻断其余项
    }
  }))
}

/**
 * 持久化单个设置项：仅在设置加载完成后（ready 为 true）写回，
 * 避免加载完成前用初始值覆盖已有配置。
 * debounceMs > 0 时防抖写入（拖拽、输入等高频变化场景）。
 */
export function usePersistedSetting<T>(
  key: string,
  value: T,
  ready: boolean,
  debounceMs = 0,
  allowNull = false,
): void {
  useEffect(() => {
    // null 表示"无记录"（如折叠键从未持久化过），默认不写回，避免覆盖其他记录；
    // allowNull 时允许显式写回 null（如移除自定义主题，持久化"已移除"状态，
    // 重启后不再重新加载旧主题）
    if (!ready || (value == null && !allowNull)) return
    const write = (): Promise<void> =>
      window.desktopAPI?.settings.set(key, value).then(() => undefined, () => undefined) ?? Promise.resolve()
    if (debounceMs <= 0) {
      void write()
      return
    }
    const timer = setTimeout(() => { void write() }, debounceMs)
    pendingFlushers.add(write)
    return () => {
      clearTimeout(timer)
      pendingFlushers.delete(write)
    }
  }, [key, value, ready, debounceMs, allowNull])
}
