import { describe, expect, it } from 'vitest'
import {
  buildSupportSummary,
  sanitizeSupportSummary,
  scanSupportSummaryForForbiddenContent,
  serializeSupportSummary,
} from './support-summary'

const environment = {
  appVersion: '0.7.0',
  platform: 'win32',
  arch: 'x64',
  electronVersion: '33.0.0',
  autoUpdateEnabled: true,
  eventCounts: { workspace_open: 2 },
  recentErrorCodes: ['IO_ERROR'],
}

const workspace = {
  documentCount: 12,
  indexComplete: true,
  diagnosticsByCode: { BROKEN_LINK: 1, MISSING_ASSET: 2 },
}

describe('SupportSummaryV1 脱敏', () => {
  it('丢弃额外键并拒绝路径形字符串', () => {
    const dirty = {
      schemaVersion: 1,
      appVersion: '0.7.0',
      platform: 'win32',
      arch: 'x64',
      electronVersion: '33.0.0',
      autoUpdateEnabled: false,
      eventCounts: { save_failed: 1 },
      workspace: {
        documentCount: 1,
        indexComplete: false,
        diagnosticsByCode: { READ_ERROR: 1 },
      },
      recentErrorCodes: ['CONFLICT'],
      body: '# secret',
      lastSearchQuery: '内部词',
      workspacePath: 'C:\\Users\\secret',
    }
    const sanitized = sanitizeSupportSummary(dirty)
    expect(sanitized).not.toBeNull()
    expect(sanitized).not.toHaveProperty('body')
    expect(sanitized).not.toHaveProperty('lastSearchQuery')
    expect(sanitized).not.toHaveProperty('workspacePath')
    expect(sanitizeSupportSummary({ ...dirty, appVersion: 'C:\\bad' })).toBeNull()
  })

  it('build 与 serialize 通过禁词扫描', () => {
    const summary = buildSupportSummary(environment, workspace)
    const json = serializeSupportSummary(summary)
    expect(scanSupportSummaryForForbiddenContent(json)).toBe(false)
    expect(JSON.parse(json)).toEqual(summary)
  })
})
