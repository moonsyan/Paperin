import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CHANNELS } from '../../shared/ipc/channels'
import { buildSupportSummary, serializeSupportSummary } from '../../shared/support-summary'
import { resetRecentSupportErrorCodesForTests } from '../support/recent-error-codes'

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
