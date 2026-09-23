import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

/**
 * Windows 上 Chromium GPU 子进程偶发崩溃（exit_code=34 等）时，
 * 渲染进程仍可跑 JS，但合成层失效，表现就是只有系统标题栏按钮的白屏。
 * 通过 userData 标记在下次启动切到软栅，避免用户反复卡在空白窗口。
 */

export const GPU_FALLBACK_MARKER = 'gpu-fallback'

const markerPath = (): string => join(app.getPath('userData'), GPU_FALLBACK_MARKER)

export const isGpuFallbackRequested = (
  env: NodeJS.ProcessEnv = process.env,
  markerExists = (): boolean => existsSync(markerPath()),
): boolean => env.PAPERIN_DISABLE_GPU === '1' || markerExists()

/** 必须在 app ready 之前调用；返回是否已启用软栅 */
export const applyGpuFallbackEarly = (): boolean => {
  if (!isGpuFallbackRequested()) return false
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  return true
}

export const rememberGpuFallback = (): void => {
  try {
    const path = markerPath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${new Date().toISOString()}\n`, 'utf-8')
  } catch {
    /* 标记失败不能再抛——GPU 路径本身已不稳定 */
  }
}

/**
 * GPU 子进程异常退出后记下标记。
 * 若本次启动尚未走软栅，则自动 relaunch 一次，避免用户卡在白屏。
 */
export const armGpuCrashFallback = (startedWithFallback: boolean): void => {
  let relaunchScheduled = false
  app.on('child-process-gone', (_event, details) => {
    if (details.type !== 'GPU') return
    rememberGpuFallback()
    console.error(
      `[gpu-fallback] GPU process gone (reason=${details.reason}, exitCode=${details.exitCode}); soft rendering will be used on next launch`,
    )
    if (startedWithFallback || relaunchScheduled) return
    relaunchScheduled = true
    app.relaunch()
    app.exit(0)
  })
}
