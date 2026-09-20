import { ipcMain } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import {
  deleteDraft,
  getSetting,
  setSetting,
  SettingsStoreError,
  upsertDraft,
} from '../settings/settings-store'
import {
  isRestrictedSettingsReadKey,
  isRestrictedSettingsWriteKey,
} from './settings-policy'

/** 自定义主题 CSS 上限：与 FILE_PICK_CSS 的读取上限一致（1MB） */
const MAX_CUSTOM_CSS_SIZE = 1024 * 1024

export const registerSettingsHandlers = (): void => {
  ipcMain.handle(CHANNELS.SETTINGS_GET, async (_event, key: string) => {
    // 与 SETTINGS_SET 同口径：非字符串/空 key 返回 INVALID_ARGUMENT，
    // 避免垃圾键（"[object Object]" 等）进入 settings 查询路径
    if (typeof key !== 'string' || !key || key.length > 256) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
    }
    if (isRestrictedSettingsReadKey(key)) {
      return { ok: false, error: { code: 'RESTRICTED_KEY' } }
    }
    try {
      return { ok: true, data: await getSetting(key) }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(
    CHANNELS.SETTINGS_SET,
    async (_event, args: { key: string; value: unknown }) => {
      // key 非字符串时不仅返回 IO_ERROR 不合规，还会经对象字面量 computed key
      // 把 "[object Object]" / "42" 之类的垃圾键写进 settings.json
      if (typeof args?.key !== 'string' || !args.key || args.key.length > 256) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      if (isRestrictedSettingsWriteKey(args.key)) {
        return { ok: false, error: { code: 'RESTRICTED_KEY' } }
      }
      try {
        await setSetting(args.key, args.value)
        return { ok: true }
      } catch (error) {
        if (error instanceof SettingsStoreError) {
          return { ok: false, error: { code: error.code } }
        }
        return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
      }
    },
  )

  ipcMain.handle(
    CHANNELS.SETTINGS_UPSERT_DRAFT,
    async (
      _event,
      args: { id: string; content: string; baselineSha256?: string; draftSessionId?: string },
    ) => {
      if (!args || typeof args.id !== 'string' || !args.id || args.id.length > 512 || typeof args.content !== 'string') {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      if (
        args.baselineSha256 !== undefined
        && (typeof args.baselineSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(args.baselineSha256))
      ) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      if (
        args.draftSessionId !== undefined
        && (typeof args.draftSessionId !== 'string' || !args.draftSessionId || args.draftSessionId.length > 128)
      ) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      try {
        await upsertDraft(args.id, args.content, args.baselineSha256, args.draftSessionId)
        return { ok: true }
      } catch (error) {
        if (error instanceof SettingsStoreError) {
          return { ok: false, error: { code: error.code } }
        }
        return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
      }
    },
  )

  ipcMain.handle(
    CHANNELS.SETTINGS_DELETE_DRAFT,
    async (_event, args: string | { id: string; draftSessionId?: string }) => {
      const id = typeof args === 'string' ? args : args?.id
      const draftSessionId = typeof args === 'object' && args ? args.draftSessionId : undefined
      if (typeof id !== 'string' || !id || id.length > 512) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      if (
        draftSessionId !== undefined
        && (typeof draftSessionId !== 'string' || !draftSessionId || draftSessionId.length > 128)
      ) {
        return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
      }
      try {
        await deleteDraft(id, draftSessionId)
        return { ok: true }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  // 自定义 CSS 专用写入通道（主题 customCss / 导出模板 exportCss 共用校验）：
  // 通用 SETTINGS_SET 已禁止写入这两个键，本通道在落盘前校验形状与体积
  // （与 FILE_PICK_CSS 的 1MB 读取上限一致），保证"主进程读取/校验 → 持久化"
  // 的受控来源不因渲染层异常而绕过。
  const setManagedCss = async (
    key: 'customCss' | 'exportCss',
    value: unknown,
  ): Promise<{ ok: boolean; error?: { code: string; message?: string } }> => {
    // null = 移除，允许显式写回并持久化"已移除"状态
    if (value === null) {
      try {
        await setSetting(key, null)
        return { ok: true }
      } catch (error) {
        if (error instanceof SettingsStoreError) {
          return { ok: false, error: { code: error.code } }
        }
        return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
      }
    }
    if (
      !value ||
      typeof value !== 'object' ||
      typeof (value as { name?: unknown }).name !== 'string' ||
      typeof (value as { content?: unknown }).content !== 'string' ||
      !(value as { content: string }).content
    ) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
    }
    const name = (value as { name: string }).name
    const content = (value as { content: string }).content
    if (!name || name.length > 256) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
    }
    if (Buffer.byteLength(content, 'utf-8') > MAX_CUSTOM_CSS_SIZE) {
      return { ok: false, error: { code: 'TOO_LARGE', message: 'CSS 文件过大（>1MB）' } }
    }
    try {
      await setSetting(key, { name, content })
      return { ok: true }
    } catch (error) {
      if (error instanceof SettingsStoreError) {
        return { ok: false, error: { code: error.code } }
      }
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  }

  ipcMain.handle(CHANNELS.SETTINGS_SET_CUSTOM_CSS, async (_event, value: unknown) =>
    setManagedCss('customCss', value),
  )

  ipcMain.handle(CHANNELS.SETTINGS_SET_EXPORT_CSS, async (_event, value: unknown) =>
    setManagedCss('exportCss', value),
  )
}
