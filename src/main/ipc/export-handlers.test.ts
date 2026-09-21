import { describe, expect, it } from 'vitest'
import {
  DELIVERY_REPORT_FILE_NAME,
  MAX_DELIVERY_REPORT_BYTES,
  parseOptionalExportBundleReport,
  validateExportBundleReport,
} from '../../shared/delivery-report'

const validJson = JSON.stringify({
  schemaVersion: 1,
  generatedAt: '2026-09-21T00:00:00.000Z',
  documentCount: 1,
  diagnosticsByCode: { BROKEN_LINK: 1 },
  missingTargets: ['资料/a.md'],
  indexComplete: true,
})

describe('FILE_EXPORT_BUNDLE 交付报告校验', () => {
  it('拒绝路径穿越文件名、空数据和超过 1 MiB 的报告', () => {
    expect(validateExportBundleReport('../paperin-delivery-report.json', validJson)).toEqual({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: '交付报告文件名不受支持',
    })
    expect(validateExportBundleReport('reports/paperin-delivery-report.json', validJson).ok).toBe(false)
    expect(validateExportBundleReport(DELIVERY_REPORT_FILE_NAME, '')).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
      message: '交付报告为空',
    })
    expect(validateExportBundleReport(DELIVERY_REPORT_FILE_NAME, '   ')).toMatchObject({
      ok: false,
      code: 'INVALID_ARGUMENT',
    })
    const oversized = `{${'a'.repeat(MAX_DELIVERY_REPORT_BYTES + 1)}}`
    expect(validateExportBundleReport(DELIVERY_REPORT_FILE_NAME, oversized)).toMatchObject({
      ok: false,
      code: 'TOO_LARGE',
    })
  })

  it('合法报告只保留白名单字段后再写出', () => {
    const dirty = JSON.stringify({
      schemaVersion: 1,
      generatedAt: '2026-09-21T00:00:00.000Z',
      documentCount: 2,
      diagnosticsByCode: { MISSING_ASSET: 1 },
      missingTargets: ['img/a.png'],
      indexComplete: false,
      body: '# 不该出现',
      lastSearchQuery: '内部词',
    })
    const result = validateExportBundleReport(DELIVERY_REPORT_FILE_NAME, dirty)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fileName).toBe(DELIVERY_REPORT_FILE_NAME)
    expect(JSON.parse(result.json)).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-09-21T00:00:00.000Z',
      documentCount: 2,
      diagnosticsByCode: { MISSING_ASSET: 1 },
      missingTargets: ['img/a.png'],
      indexComplete: false,
    })
    expect(result.json).not.toMatch(/不该出现|内部词/)
  })

  it('未提供报告时跳过，不阻断旧资源包协议', () => {
    expect(parseOptionalExportBundleReport(undefined)).toEqual({ ok: true })
    expect(parseOptionalExportBundleReport({ fileName: '../x.json', json: validJson }).ok).toBe(false)
  })
})
