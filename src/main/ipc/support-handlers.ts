import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { CHANNELS } from '../../shared/ipc/channels'
import {
  sanitizeSupportSummary,
  scanSupportSummaryForForbiddenContent,
  serializeSupportSummary,
  type SupportSummaryV1,
} from '../../shared/support-summary'
import { getSetting } from '../settings/settings-store'
import { getRecentSupportErrorCodes } from '../support/recent-error-codes'
import { getSupportEventCounts } from '../support/support-event-counts'
import { recordSupportIpcFailure } from '../support/support-ipc-tracking'

const parseSummaryJson = (json: unknown): SupportSummaryV1 | null => {
  if (typeof json !== 'string' || !json.trim()) return null
  if (scanSupportSummaryForForbiddenContent(json)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  return sanitizeSupportSummary(parsed)
}

export const registerSupportHandlers = (): void => {
  ipcMain.handle(CHANNELS.SUPPORT_GET_ENV, async () => {
    try {
      const autoUpdateEnabled = (await getSetting('autoUpdateEnabled')) !== false
      return {
        ok: true,
        data: {
          appVersion: app.getVersion(),
          platform: process.platform,
          arch: process.arch,
          electronVersion: process.versions.electron ?? 'unknown',
          autoUpdateEnabled,
          eventCounts: { ...getSupportEventCounts() },
          recentErrorCodes: [...getRecentSupportErrorCodes()],
        },
      }
    } catch (error) {
      recordSupportIpcFailure('IO_ERROR')
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(CHANNELS.SUPPORT_SAVE_SUMMARY, async (event, json: unknown) => {
    const summary = parseSummaryJson(json)
    if (!summary) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
    }
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined
    let save: Awaited<ReturnType<typeof dialog.showSaveDialog>>
    try {
      const saveOptions = {
        title: '导出支持摘要',
        defaultPath: 'paperin-support-summary.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      }
      save = parent
        ? await dialog.showSaveDialog(parent, saveOptions)
        : await dialog.showSaveDialog(saveOptions)
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
    if (save.canceled || !save.filePath) {
      return { ok: false, error: { code: 'CANCELLED' } }
    }
    try {
      await writeFile(save.filePath, serializeSupportSummary(summary), 'utf-8')
      return { ok: true }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })

  ipcMain.handle(CHANNELS.SUPPORT_EXPORT_TEMP, async (_event, json: unknown) => {
    const summary = parseSummaryJson(json)
    if (!summary) {
      return { ok: false, error: { code: 'INVALID_ARGUMENT' } }
    }
    const fileName = `paperin-support-summary-${Date.now()}.json`
    const target = join(app.getPath('temp'), fileName)
    try {
      await writeFile(target, serializeSupportSummary(summary), 'utf-8')
      return { ok: true, data: { fileName } }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })
}
