import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CHANNELS } from '../../shared/ipc/channels'
import {
  buildSupportSummary,
  scanSupportSummaryForForbiddenContent,
  serializeSupportSummary,
} from '../../shared/support-summary'
import { noteSupportErrorCode, resetRecentSupportErrorCodesForTests } from '../support/recent-error-codes'
import { noteSupportEvent, resetSupportEventCountsForTests } from '../support/support-event-counts'

const writeFile = vi.fn(async () => undefined)
const showSaveDialog = vi.fn(async () => ({ canceled: true, filePath: undefined as string | undefined }))

vi.mock('fs/promises', () => ({
  writeFile: (path: unknown, data: unknown) => {
    void path
    void data
    return writeFile()
  },
}))

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.7.0-test',
    getPath: (key: string) => (key === 'temp' ? 'C:\\Temp\\paperin-test' : key),
  },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showSaveDialog: () => showSaveDialog() },
  ipcMain: { handle: vi.fn() },
}))

vi.mock('../settings/settings-store', () => ({
  getSetting: vi.fn(async () => true),
}))

describe('support-handlers 契约', () => {
  beforeEach(() => {
    writeFile.mockClear()
    showSaveDialog.mockClear()
    resetRecentSupportErrorCodesForTests()
    resetSupportEventCountsForTests()
  })

  it('SUPPORT_GET_ENV 合并事件计数与 recentErrorCodes', async () => {
    noteSupportEvent('workspace_open')
    noteSupportErrorCode('CONFLICT')
    noteSupportErrorCode('IO_ERROR')
    const { registerSupportHandlers } = await import('./support-handlers')
    registerSupportHandlers()
    const { ipcMain } = await import('electron')
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(
      (call) => call[0] === CHANNELS.SUPPORT_GET_ENV,
    )?.[1] as () => Promise<{ ok: boolean; data?: { eventCounts: Record<string, number>; recentErrorCodes: string[] } }>
    const result = await handler?.()
    expect(result?.ok).toBe(true)
    expect(result?.data?.eventCounts).toEqual({ workspace_open: 1 })
    expect(result?.data?.recentErrorCodes).toEqual(['IO_ERROR', 'CONFLICT'])
    const json = serializeSupportSummary({
      schemaVersion: 1,
      appVersion: result?.data ? '0.7.0-test' : '0.0.0',
      platform: 'win32',
      arch: 'x64',
      electronVersion: '33.0.0',
      autoUpdateEnabled: true,
      eventCounts: result?.data?.eventCounts ?? {},
      recentErrorCodes: result?.data?.recentErrorCodes ?? [],
      workspace: { documentCount: 0, indexComplete: false, diagnosticsByCode: {} },
    })
    expect(scanSupportSummaryForForbiddenContent(json)).toBe(false)
  })

  it('取消保存时不写文件', async () => {
    const { registerSupportHandlers } = await import('./support-handlers')
    registerSupportHandlers()
    const { ipcMain } = await import('electron')
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(
      (call) => call[0] === CHANNELS.SUPPORT_SAVE_SUMMARY,
    )?.[1] as (event: unknown, json: string) => Promise<{ ok: boolean; error?: { code: string } }>
    expect(handler).toBeDefined()
    const summary = serializeSupportSummary(
      buildSupportSummary(
        {
          appVersion: '0.7.0',
          platform: 'win32',
          arch: 'x64',
          electronVersion: '33.0.0',
          autoUpdateEnabled: true,
          eventCounts: {},
          recentErrorCodes: [],
        },
        { documentCount: 0, indexComplete: false, diagnosticsByCode: {} },
      ),
    )
    const result = await handler?.({ sender: {} }, summary)
    expect(result?.ok).toBe(false)
    expect(result?.error?.code).toBe('CANCELLED')
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('拒绝含禁词的 JSON', async () => {
    const { registerSupportHandlers } = await import('./support-handlers')
    registerSupportHandlers()
    const { ipcMain } = await import('electron')
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(
      (call) => call[0] === CHANNELS.SUPPORT_EXPORT_TEMP,
    )?.[1] as (event: unknown, json: string) => Promise<{ ok: boolean; error?: { code: string } }>
    const bad = JSON.stringify({ schemaVersion: 1, body: 'secret' })
    const result = await handler?.({}, bad)
    expect(result?.ok).toBe(false)
    expect(result?.error?.code).toBe('INVALID_ARGUMENT')
    expect(writeFile).not.toHaveBeenCalled()
  })
})
