import { describe, expect, it } from 'vitest'
import { createEmptyWorkspaceIndex } from '../../../shared/workspace-index'
import type { DiagnosticRecord, IndexedDocument } from '../../../shared/workspace-index'
import { sanitizeDeliveryReport } from '../../../shared/delivery-report'
import { buildDeliveryReport } from './delivery-report'

const document = (relativePath: string, path = `D:/notes/${relativePath}`): IndexedDocument => ({
  path,
  relativePath,
  name: relativePath.split('/').pop() ?? relativePath,
  size: 10,
  modifiedTime: 1,
  headings: [],
  tags: [],
  frontmatter: {},
  outgoingLinks: [],
  imageRefs: [],
})

const diagnostic = (partial: Partial<DiagnosticRecord> & Pick<DiagnosticRecord, 'id' | 'code'>): DiagnosticRecord => ({
  severity: 'warning',
  path: '资料/a.md',
  message: 'x',
  ...partial,
})

describe('buildDeliveryReport', () => {
  it('完整索引按诊断码计数，并只保留工作区相对缺失目标', () => {
    const index = createEmptyWorkspaceIndex('D:/notes')
    index.complete = true
    index.documents = {
      'D:/notes/资料/a.md': document('资料/a.md'),
      'D:/notes/资料/b.md': document('资料/b.md'),
    }
    const report = buildDeliveryReport(index, [
      diagnostic({ id: '1', code: 'BROKEN_LINK', target: '资料/missing.md' }),
      diagnostic({ id: '2', code: 'BROKEN_LINK', path: 'D:/notes/资料/a.md', target: 'C:/secret.md' }),
      diagnostic({ id: '3', code: 'EMPTY_HEADING', path: 'D:/notes/资料/a.md' }),
      diagnostic({ id: '4', code: 'MISSING_ASSET', target: 'assets/图.png' }),
    ], { generatedAt: '2026-09-21T12:00:00.000Z' })

    expect(report).toEqual(expect.objectContaining({
      schemaVersion: 1,
      generatedAt: '2026-09-21T12:00:00.000Z',
      documentCount: 2,
      indexComplete: true,
      diagnosticsByCode: { BROKEN_LINK: 2, EMPTY_HEADING: 1, MISSING_ASSET: 1 },
      missingTargets: ['资料/missing.md', 'assets/图.png'],
    }))
    expect(JSON.stringify(report)).not.toMatch(/D:\\\\notes|C:\\\\secret|content|query/)
  })

  it('截断或不完整索引标记 indexComplete=false，绝对路径不会进入报告', () => {
    const index = createEmptyWorkspaceIndex('D:/notes')
    index.complete = true
    index.truncated = true
    const report = buildDeliveryReport(index, [
      diagnostic({ id: '1', code: 'UNRESOLVED_WIKI', path: 'D:/notes/a.md', target: '../secret.md' }),
    ])
    expect(report.indexComplete).toBe(false)
    expect(report.missingTargets).toEqual([])
  })

  it('白名单丢弃正文、搜索词和未知字段', () => {
    const sanitized = sanitizeDeliveryReport({
      schemaVersion: 1,
      generatedAt: '2026-09-21T00:00:00.000Z',
      documentCount: 1,
      diagnosticsByCode: { BROKEN_LINK: 1 },
      missingTargets: ['资料/a.md'],
      indexComplete: true,
      body: '# 秘密正文',
      content: '丢弃',
      lastSearchQuery: '内部检索词',
      absolutePath: 'D:/notes/a.md',
    })
    expect(sanitized).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-09-21T00:00:00.000Z',
      documentCount: 1,
      diagnosticsByCode: { BROKEN_LINK: 1 },
      missingTargets: ['资料/a.md'],
      indexComplete: true,
    })
    expect(sanitized && 'body' in sanitized).toBe(false)
  })
})
