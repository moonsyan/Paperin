import { app, shell, BrowserWindow, Menu, protocol } from 'electron'
import { dirname, join } from 'path'
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from 'fs'
import { stat as statFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { createWindow } from './window/window-manager'
import { registerIpcHandlers } from './ipc/handlers'
import { allowImageDirectory, fetchAllowedImage } from './image-protocol'
import { schedulePersistTrust } from './session-trust'
import { applySmokeUserData, parseSmokeWorkspace, runElectronSmoke } from './testing/electron-smoke'
import { trustFileForSave } from './trusted-paths'
import { getSetting } from './settings/settings-store'
import { shouldCheckForUpdates, shouldInstallUpdateOnQuit } from './updater/update-policy'
import { CHANNELS } from '../shared/ipc/channels'
import {
  chooseSystemOpenDisposition,
  collectSystemOpenFiles,
  normalizeSystemOpenFile,
} from './window/system-file-open'

// 冒烟模式（--smoke <工作区>，供 scripts/smoke-electron.mjs 调用）：
// 必须在下方任何 userData 读取之前切换到一次性临时目录
const smokeWorkspace = parseSmokeWorkspace()
if (smokeWorkspace) applySmokeUserData()
// Electron smoke runs in headless/CI environments where Chromium's GPU DLL
// may be unavailable; disable hardware acceleration before app readiness.
if (smokeWorkspace) app.disableHardwareAcceleration()

/* ==================== 主进程兜底日志 ==================== */

// 未捕获异常/未处理拒绝默认会终止主进程（整个应用退出且无痕迹）。
// 这里只记录到 userData/logs/main.log 便于崩溃后排查，不再向上抛出——
// 渲染层各有恢复路径（render-process-gone 自愈重载），主进程退出代价最大。
// 日志轮转：超过 2MB 时滚动为 main.old.log，避免长期使用无限增长
const MAIN_LOG_MAX_BYTES = 2 * 1024 * 1024

function appendMainLog(kind: string, payload: unknown): void {
  try {
    const logsDir = join(app.getPath('userData'), 'logs')
    const logPath = join(logsDir, 'main.log')
    mkdirSync(logsDir, { recursive: true })
    try {
      if (statSync(logPath).size > MAIN_LOG_MAX_BYTES) {
        renameSync(logPath, join(logsDir, 'main.old.log'))
      }
    } catch {
      /* 首次写入或旧日志不存在，无需轮转 */
    }
    const detail = payload instanceof Error ? `${payload.name}: ${payload.message}\n${payload.stack ?? ''}` : String(payload)
    appendFileSync(logPath, `[${new Date().toISOString()}] ${kind}: ${detail}\n`, 'utf-8')
  } catch {
    /* 日志失败不能再引发异常 */
  }
}

process.on('uncaughtException', (err) => {
  appendMainLog('uncaughtException', err)
})
process.on('unhandledRejection', (reason) => {
  appendMainLog('unhandledRejection', reason)
})

// 本地图片协议：mdimg:///<绝对路径> → 渲染进程可直接展示本地图片
// （必须在 app ready 之前注册特权）
// Y-M1：页面 CSP 为 default-src 'self'，mdimg 为自定义 scheme 与文档不同源，
// 无 bypassCSP 时 <img src="mdimg:///..."> 被 CSP 直接拒绝（真实 Electron
// 对照实验验证：不加时 naturalWidth=0，加后正常加载）。信任边界仍由
// fetchAllowedImage 打开普通文件句柄并核对 inode，放行 CSP 不会放开读取
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mdimg',
    privileges: {
      secure: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: true,
    },
  },
])

// 单实例锁：多窗口模式（上次会话开启过）下跳过，允许多开；
// 需在 app ready 前同步读取设置
let multiWindowMode = false
try {
  // 启动前不设体积守卫会让损坏的超大 settings.json 同步 parse 卡死/OOM 启动
  // （settings-store 才有 40MB 损坏判定与自愈备份，但它不在本路径上）。
  // 超限文件跳过多窗口判定，交给 store 的异步自愈流程处理
  const settingsFile = join(app.getPath('userData'), 'settings.json')
  const settingsStat = statSync(settingsFile)
  if (settingsStat.size <= 40 * 1024 * 1024) {
    const raw = readFileSync(settingsFile, 'utf-8')
    multiWindowMode = (JSON.parse(raw) as { multiWindow?: boolean }).multiWindow === true
  }
} catch {
  multiWindowMode = false
}

let systemOpenReady = false
const pendingSystemOpenFiles: string[] = []

const focusWindow = (window: BrowserWindow | undefined): void => {
  if (!window || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.focus()
}

/** Validate and authorize an OS-delivered path before exposing it to Renderer. */
const routeSystemOpenFile = async (candidate: string): Promise<boolean> => {
  const filePath = normalizeSystemOpenFile(candidate, process.platform)
  if (!filePath) return false
  const fileInfo = await statFile(filePath).catch(() => null)
  if (!fileInfo?.isFile()) return false

  // Association/open-file is an explicit OS user action. Grant only the file
  // itself for read/write, plus its directory for relative image reads.
  await trustFileForSave(filePath)
  allowImageDirectory(dirname(filePath))
  schedulePersistTrust()

  const windows = BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed())
  const disposition = chooseSystemOpenDisposition(multiWindowMode, windows.length > 0)
  if (disposition === 'fresh-window') {
    createWindow(true, filePath)
    return true
  }

  const target = BrowserWindow.getFocusedWindow() ?? windows[0] ?? createWindow()
  const deliver = (): void => {
    if (target.isDestroyed()) return
    target.webContents.send(CHANNELS.WINDOW_OPEN_FILE, filePath)
    focusWindow(target)
  }
  if (target.webContents.isLoadingMainFrame()) {
    target.webContents.once('did-finish-load', deliver)
  } else {
    deliver()
  }
  return true
}

const queueOrRouteSystemFiles = (paths: readonly string[]): void => {
  if (!systemOpenReady) {
    pendingSystemOpenFiles.push(...paths)
    return
  }
  paths.forEach((path) => {
    void routeSystemOpenFile(path)
  })
}

if (!multiWindowMode) {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  } else {
    // 再次启动时聚焦已有窗口
    app.on('second-instance', (_event, argv) => {
      const files = collectSystemOpenFiles(argv, process.platform)
      if (files.length > 0) {
        queueOrRouteSystemFiles(files)
        return
      }
      focusWindow(BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0])
    })
  }
}

// macOS Finder delivers associated documents through open-file, sometimes
// before ready. Queue them until IPC handlers and the first window are ready.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  const normalized = normalizeSystemOpenFile(filePath, process.platform)
  if (normalized) queueOrRouteSystemFiles([normalized])
})

async function initApp(): Promise<void> {
  // 安全设置
  // AUMID 仅在打包后指向应用 ID：开发态没有对应的开始菜单快捷方式，
  // Windows 解析不到任务栏图标会退回 electron.exe 默认图标；
  // 开发态改用进程路径，任务栏沿用 BrowserWindow 配置的窗口图标
  electronApp.setAppUserModelId(is.dev ? process.execPath : 'com.paperin.app')

  // 移除原生菜单：避免系统默认快捷键与编辑器冲突，快捷键全部由渲染进程接管
  Menu.setApplicationMenu(null)

  // 优化默认行为
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 处理 mdimg 协议：仅允许已打开文档或工作区范围内的图片资源。
  protocol.handle('mdimg', (request) => fetchAllowedImage(request.url))

  // 注册 IPC 处理器
  registerIpcHandlers()

  const launchFiles = collectSystemOpenFiles(
    [...process.argv, ...pendingSystemOpenFiles],
    process.platform,
  )
  pendingSystemOpenFiles.length = 0
  systemOpenReady = true

  // A normal window restores the last workspace. In multi-window mode an OS
  // association opens an isolated fresh window so shared session persistence
  // cannot be overwritten by two renderer sessions.
  if (!multiWindowMode || launchFiles.length === 0) createWindow()
  let openedLaunchFile = false
  for (const filePath of launchFiles) {
    openedLaunchFile = await routeSystemOpenFile(filePath) || openedLaunchFile
  }
  if (multiWindowMode && launchFiles.length > 0 && !openedLaunchFile) createWindow()

  // 冒烟场景：窗口就绪后自动驱动"打开工作区→保存→冲突→重命名→搜索"主链路，
  // 以进程退出码报告结果（正常用户启动不带 --smoke，不进入此分支）
  if (smokeWorkspace) void runElectronSmoke(smokeWorkspace, launchFiles[0])

  // 自动更新：开发环境永不检查。生产环境由 autoUpdateEnabled 同时控制
  // 检查、自动下载和退出时安装；关闭后不得安装此前已下载的包。
  autoUpdater.on('error', () => {
    /* 更新失败不影响使用 */
  })
  const autoUpdateEnabled = (await getSetting('autoUpdateEnabled')) !== false
  const checkUpdates = shouldCheckForUpdates(is.dev, autoUpdateEnabled)
  const installOnQuit = shouldInstallUpdateOnQuit(is.dev, autoUpdateEnabled)
  autoUpdater.autoDownload = checkUpdates
  autoUpdater.autoInstallOnAppQuit = installOnQuit
  if (checkUpdates) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      /* 更新检查失败（未发布 latest.yml / 无网络等）不影响使用 */
    })
  }

  // macOS: 点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.whenReady().then(initApp).catch((err) => {
  console.error('App initialization failed:', err)
  app.exit(1)
})

// 退出保护：未保存内容的确认由每个窗口的渲染层 beforeunload 拦截（见 App.tsx）；
// 此处无需重复处理。

// 安全: 禁止导航到外部；新开窗口请求转交系统浏览器（仅限安全协议，
// 避免恶意文档中的 javascript:/file:/自定义协议链接被拉起）
app.on('web-contents-created', (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
      void shell.openExternal(url).catch(() => {})
    }
    return { action: 'deny' }
  })

  // M15：will-navigate 在 web-contents-created 一次性注册，不再依赖
  // did-finish-load 延迟注册（重载/崩溃自愈会累计重复监听，点一个外链开 N 个标签）。
  // 程序化导航（loadFile/loadURL/reload）不触发 will-navigate，初始加载不受影响。
  // 普通链接没有 target 时会在当前窗口内导航；统一交给系统浏览器，
  // 避免应用壳被陌生页面替换（仅限安全协议，恶意文档中的 javascript:/file:/自定义协议不会放行）。
  contents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
      void shell.openExternal(url).catch(() => {})
    }
  })
})
