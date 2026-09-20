import { describe, expect, it } from 'vitest'
import {
  createInitialWorkspaceCoverage,
  markWorkspaceCoverageIncomplete,
  workspaceCoverageLegacyFlags,
} from './workspace-coverage'

describe('workspaceCoverageLegacyFlags', () => {
  it('仅命中上限时不推断为未扫完', () => {
    const coverage = createInitialWorkspaceCoverage()
    coverage.matchCapped = true
    markWorkspaceCoverageIncomplete(coverage)
    const flags = workspaceCoverageLegacyFlags(coverage)
    expect(flags.matchCapped).toBe(true)
    expect(flags.scanTruncated).toBe(false)
  })

  it('file-budget 跳过标记 scanTruncated', () => {
    const coverage = createInitialWorkspaceCoverage()
    markWorkspaceCoverageIncomplete(coverage)
    coverage.skipped['file-budget'] = 2
    const flags = workspaceCoverageLegacyFlags(coverage)
    expect(flags.scanTruncated).toBe(true)
  })
})
