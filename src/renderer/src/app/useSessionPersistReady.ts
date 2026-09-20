import { useCallback, useState } from 'react'

/**
 * 草稿、最近文件、侧栏偏好必须等设置加载完成后再写盘。
 * App 里会话 hook 必须出现在 useAppSettings 之前，因此把“已就绪”做成可回填的闩锁，
 * 而不是在装配时写死 false。
 */
export function useSessionPersistReady(): {
  persistReady: boolean
  syncFromSettings: (settingsReady: boolean) => void
} {
  const [persistReady, setPersistReady] = useState(false)
  const syncFromSettings = useCallback((settingsReady: boolean) => {
    if (settingsReady) {
      setPersistReady((previous) => (previous ? previous : true))
    }
  }, [])
  return { persistReady, syncFromSettings }
}
