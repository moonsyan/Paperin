import { describe, expect, it } from 'vitest'
import { sanitizeDeliveryReport } from './delivery-report'

describe('sanitizeDeliveryReport', () => {
  it('拒绝 missingTargets 中的绝对路径与 Windows 盘符路径', () => {
    const base = {
      schemaVersion: 1 as const,
      generatedAt: '2026-09-21T00:00:00.000Z',
      documentCount: 1,
      diagnosticsByCode: { BROKEN_LINK: 1 },
      indexComplete: true,
    }
    expect(
      sanitizeDeliveryReport({ ...base, missingTargets: ['/etc/passwd'] }),
    ).toBeNull()
    expect(
      sanitizeDeliveryReport({ ...base, missingTargets: ['D:/notes/secret.md'] }),
    ).toBeNull()
    expect(
      sanitizeDeliveryReport({ ...base, missingTargets: ['资料/相对.md'] }),
    ).toEqual({
      ...base,
      missingTargets: ['资料/相对.md'],
    })
  })
})
