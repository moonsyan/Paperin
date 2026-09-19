import { BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { waitForCloseSave } from './close-save'
import { getMainWindowPlacement } from './window-options'

const CLOSE_SAVE_TIMEOUT_MS = 15_000
const UNRESPONSIVE_DIALOG_DELAY_MS = 10_000

/**
 * 创建窗口
 * @param fresh 新窗口模式：URL 带 #fresh，渲染端跳过会话恢复/写入，
 *              避免多窗口间会话互相覆盖
 * @param openFile 可选：新窗口启动后直接打开的磁盘文件路径（#fresh?file=...）
 */
export function createWindow(fresh = false, openFile?: string): BrowserWindow {
  const isMac = process.platform === 'darwin'

  const mainWindow = new BrowserWindow({
    ...getMainWindowPlacement(),
    show: false,
    title: 'Paperin',
    // 窗口/任务栏图标（与打包图标同源）
    icon: join(__dirname, '../../resources/icon.png'),
    // 去掉系统标题栏，与渲染进程的顶栏菜单栏合为一体：
    // - macOS：hiddenInset 保留红绿灯（交通灯）
    // - Windows：hidden + titleBarOverlay 由系统绘制最小化/最大化/关闭按钮
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac
      ? {}
      : {
          titleBarOverlay: {
            color: '#F0EDEA',
            symbolColor: '#5C5850',
            height: 42,
          },
        }),
    backgroundColor: '#F7F5F2',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 沙箱化 preload 提供 process.platform（ipcRenderer/contextBridge 亦可用），
      // 无需因此禁用沙箱；开启后渲染进程无法接触 Node 完整能力，进一步加固
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // 拼写检查能力保留（由设置面板控制开关，默认关）；
      // webPreferences 开启底层能力，创建后默认关闭会话级拼写，避免中文/代码红波浪线
      spellcheck: true,
    },
  })

  // 默认关闭拼写检查（用户在设置中打开时才启用）
  mainWindow.webContents.session.setSpellCheckerEnabled(false)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 白屏自愈：渲染进程崩溃或加载失败时自动重载，避免窗口挂死；
  // 连续自愈设上限，防止持续性失败（如文件损坏）演变为重载风暴
  let autoReloads = 0
  const MAX_AUTO_RELOADS = 3
  const AUTO_RELOAD_RESET_DELAY_MS = 30_000
  let resetAutoReloadsTimer: ReturnType<typeof setTimeout> | null = null
  const attemptReload = () => {
    if (autoReloads >= MAX_AUTO_RELOADS) return
    if (resetAutoReloadsTimer) {
      clearTimeout(resetAutoReloadsTimer)
      resetAutoReloadsTimer = null
    }
    autoReloads++
    mainWindow.webContents.reload()
  }
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    // L1：oom 是最常见的内存崩溃，纳入自愈（MAX_AUTO_RELOADS 已限风暴）。
    // 仅对崩溃类原因重载；clean-exit 等主动退出不在此列。
    if (details.reason !== 'crashed' && details.reason !== 'killed' && details.reason !== 'oom') return
    attemptReload()
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    // ERR_ABORTED 通常来自主动重载；子框架失败不应影响应用主页面。
    if (errorCode === -3 || !isMainFrame) return
    attemptReload()
  })
  // 必须稳定运行一段时间才重置计数，否则"加载后立刻崩溃"会无限重载。
  mainWindow.webContents.on('did-finish-load', () => {
    if (resetAutoReloadsTimer) clearTimeout(resetAutoReloadsTimer)
    resetAutoReloadsTimer = setTimeout(() => {
      autoReloads = 0
      resetAutoReloadsTimer = null
    }, AUTO_RELOAD_RESET_DELAY_MS)
  })
  mainWindow.once('closed', () => {
    if (resetAutoReloadsTimer) clearTimeout(resetAutoReloadsTimer)
  })

  // 无响应自愈：渲染进程长时间卡死（如超大文档同步解析、第三方渲染异常）时
  // 主进程仍可响应，给用户"继续等待 / 重新加载"的选择；
  // 短暂卡顿（10 秒内恢复）不弹窗打扰，同一时刻只保留一个对话框
  let unresponsiveTimer: ReturnType<typeof setTimeout> | null = null
  let unresponsiveDialogOpen = false
  mainWindow.on('unresponsive', () => {
    if (unresponsiveDialogOpen || unresponsiveTimer) return
    unresponsiveTimer = setTimeout(() => {
      unresponsiveTimer = null
      if (mainWindow.isDestroyed()) return
      unresponsiveDialogOpen = true
      void dialog
        .showMessageBox(mainWindow, {
          type: 'warning',
          title: '窗口无响应',
          message: '编辑器窗口已无响应一段时间，可能正在处理大文档或遇到异常。',
          detail: '重新加载会丢失最近约 1 秒内尚未写入草稿的输入；其余未保存内容会在恢复后从草稿找回。',
          buttons: ['继续等待', '重新加载'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
        .then(({ response }) => {
          unresponsiveDialogOpen = false
          if (response === 1 && !mainWindow.isDestroyed()) mainWindow.webContents.reload()
        })
        .catch(() => {
          unresponsiveDialogOpen = false
        })
    }, UNRESPONSIVE_DIALOG_DELAY_MS)
  })
  mainWindow.on('responsive', () => {
    if (unresponsiveTimer) {
      clearTimeout(unresponsiveTimer)
      unresponsiveTimer = null
    }
  })
  mainWindow.once('closed', () => {
    if (unresponsiveTimer) clearTimeout(unresponsiveTimer)
  })

  // 关闭前由渲染进程保存全部文档。磁盘文件静默写回，未命名文档显示另存为；
  // 任一保存失败或用户取消时保持窗口，不提供丢弃内容的分支。
  let closeSaveInProgress = false
  mainWindow.on('close', (e) => {
    if (closeSaveInProgress) {
      e.preventDefault()
      return
    }
    e.preventDefault()
    closeSaveInProgress = true
    const wc = mainWindow.webContents
    const savePromise = wc.executeJavaScript(
      'window.__paperin_saveAll ? window.__paperin_saveAll() : Promise.resolve(false)',
    )
    void waitForCloseSave(
      () => savePromise,
      CLOSE_SAVE_TIMEOUT_MS,
      () => {
        void wc.executeJavaScript(
          'window.__paperin_abandonCloseSave ? window.__paperin_abandonCloseSave() : undefined',
        ).catch(() => {})
      },
    ).then(async (outcome) => {
      if (mainWindow.isDestroyed()) return
      if (outcome !== 'saved') {
        // 窗口保持打开；用户主动取消（另存为对话框）不打扰，
        // 超时/异常则经渲染层轻提示告知原因并闪烁任务栏引起注意
        if (outcome === 'timedout' || outcome === 'failed') {
          const message =
            outcome === 'timedout'
              ? `关闭前保存超过 ${CLOSE_SAVE_TIMEOUT_MS / 1000} 秒未完成，窗口未关闭，请稍后重试`
              : '关闭前保存未完成，窗口未关闭'
          void wc.executeJavaScript(
        `window.__paperin_notify ? window.__paperin_notify(${JSON.stringify(message)}) : undefined`,
          ).catch(() => {})
          mainWindow.flashFrame(true)
        }
        // 超时后等在途保存结束，才能开始下一次关窗，避免两路 saveAll 并行写盘
        if (outcome === 'timedout') await savePromise.catch(() => {})
        closeSaveInProgress = false
        return
      }
      mainWindow.destroy()
    })
  })

  // DevTools 不随窗口自动打开；需要时用 Ctrl+Shift+I 手动开关（仅开发模式）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (is.dev && input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools()
      event.preventDefault()
    }
  })

  // fresh 窗口的 hash：可携带待打开文件路径（渲染端启动后自动打开）
  const freshHash = fresh
    ? `fresh${openFile ? `?file=${encodeURIComponent(openFile)}` : ''}`
    : undefined

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + (freshHash ? `#${freshHash}` : ''))
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: freshHash,
    })
  }

  return mainWindow
}
