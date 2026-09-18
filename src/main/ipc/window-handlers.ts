import { BrowserWindow, ipcMain } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import { isFileTrustedForSave, trustFileForSave } from '../trusted-paths'
import { setWebContentsUnsaved } from '../unsaved'
import { createWindow } from '../window/window-manager'
import { isWindowCapacityAvailable } from './window-capacity'

export interface WindowHandlerDependencies {
  isTrustedPath(candidate: unknown): boolean
}

export const registerWindowHandlers = ({ isTrustedPath }: WindowHandlerDependencies): void => {
  const windowCapacityOk = (): boolean =>
    isWindowCapacityAvailable(BrowserWindow.getAllWindows().length)

  ipcMain.handle(CHANNELS.WINDOW_NEW, () => {
    try {
      if (!windowCapacityOk()) {
        return { ok: false, error: { code: 'WINDOW_LIMIT' } }
      }
      createWindow(true)
      return { ok: true }
    } catch {
      return { ok: false, error: { code: 'WINDOW_CREATE_FAILED' } }
    }
  })

  ipcMain.handle(CHANNELS.WINDOW_NEW_WITH_FILE, async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { ok: false, error: { code: 'INVALID_PATH' } }
      }
      if (!windowCapacityOk()) {
        return { ok: false, error: { code: 'WINDOW_LIMIT' } }
      }
      if (!isTrustedPath(filePath) && !(await isFileTrustedForSave(filePath))) {
        return { ok: false, error: { code: 'INVALID_PATH' } }
      }
      await trustFileForSave(filePath)
      createWindow(true, filePath)
      return { ok: true }
    } catch {
      return { ok: false, error: { code: 'WINDOW_CREATE_FAILED' } }
    }
  })

  ipcMain.on(CHANNELS.WINDOW_SET_UNSAVED, (event, unsaved: boolean) => {
    setWebContentsUnsaved(event.sender, !!unsaved)
  })

  // 同步标题栏覆盖层颜色（Windows 无边框窗口，跟随主题）
  ipcMain.handle(
    CHANNELS.WINDOW_SET_TITLEBAR,
    (event, args: { color: string; symbolColor?: string }) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) return { ok: false, error: { code: 'WINDOW_NOT_FOUND' } }
      // 入参校验：args 缺失/非对象或 color 非字符串时返回结构化错误，
      // 否则 args.color 解引用抛未分类异常，违反 IPC 返回约定
      if (!args || typeof args !== 'object' || typeof args.color !== 'string') {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      if (process.platform === 'win32') {
        try {
          window.setTitleBarOverlay({
            color: args.color,
            symbolColor: typeof args.symbolColor === 'string' ? args.symbolColor : '#5C5850',
            height: 42,
          })
        } catch {
          /* 部分平台不支持 titleBarOverlay，忽略 */
        }
      }
      return { ok: true }
    },
  )

  // 开关拼写检查（会话级；支持选择语言，未提供/不可用时回退 en-US）
  ipcMain.handle(
    CHANNELS.WINDOW_SET_SPELLCHECK,
    (event, args: { enabled: boolean; language?: string } | boolean) => {
      try {
        // 兼容旧版布尔参数调用
        const normalized = typeof args === 'boolean' ? { enabled: args } : args
        event.sender.session.setSpellCheckerEnabled(Boolean(normalized.enabled))
        if (normalized.enabled) {
          const availableLanguages = event.sender.session.availableSpellCheckerLanguages
          const language =
            normalized.language && availableLanguages.includes(normalized.language)
              ? normalized.language
              : 'en-US'
          event.sender.session.setSpellCheckerLanguages([language])
        }
        return { ok: true }
      } catch {
        return { ok: false, error: { code: 'SPELLCHECK_FAILED' } }
      }
    },
  )
}
