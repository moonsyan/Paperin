export type CoverageSkipReason =
  | 'file-size'
  | 'depth'
  | 'file-budget'
  | 'read-error'

export interface WorkspaceCoverage {
  /** 范围内是否已完整检查（任一预算跳过或提前停止则为 false） */
  complete: boolean
  scannedFiles: number
  skipped: Record<CoverageSkipReason, number>
  matchCapped: boolean
}

export const emptyCoverageSkipped = (): Record<CoverageSkipReason, number> => ({
  'file-size': 0,
  depth: 0,
  'file-budget': 0,
  'read-error': 0,
})

export const createInitialWorkspaceCoverage = (): WorkspaceCoverage => ({
  complete: true,
  scannedFiles: 0,
  skipped: emptyCoverageSkipped(),
  matchCapped: false,
})

export const totalCoverageSkips = (coverage: WorkspaceCoverage): number =>
  (Object.values(coverage.skipped) as number[]).reduce((sum, count) => sum + count, 0)

export const markWorkspaceCoverageIncomplete = (coverage: WorkspaceCoverage): void => {
  coverage.complete = false
}

/** 扫描预算/跳过导致未扫完（与命中条数上限分开表达） */
export const isWorkspaceScanIncomplete = (coverage: WorkspaceCoverage): boolean =>
  !coverage.complete && (totalCoverageSkips(coverage) > 0 || coverage.matchCapped)

/** 兼容现有 IPC / UI 的截断标志，不伪造百分比或“完整无结果”。 */
export const workspaceCoverageLegacyFlags = (
  coverage: WorkspaceCoverage,
): { truncated: boolean; scanTruncated: boolean; matchCapped: boolean } => {
  const matchCapped = coverage.matchCapped
  const scanTruncated =
    totalCoverageSkips(coverage) > 0 || (!coverage.complete && !matchCapped)
  return {
    matchCapped,
    scanTruncated,
    truncated: !coverage.complete || matchCapped,
  }
}

/** 单文件大小上限：搜索、索引、链接/标签索引共用（字节）。 */
export const WORKSPACE_SCAN_MAX_FILE_BYTES = 2 * 1024 * 1024
