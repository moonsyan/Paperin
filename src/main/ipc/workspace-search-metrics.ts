export interface WorkspaceSearchMetrics {
  discoveryMs: number
  metadataMs: number
  readMs: number
  scanMs: number
  totalMs: number
  discoveredFiles: number
  scannedFiles: number
  cacheHits: number
  cacheMisses: number
}

export const WORKSPACE_SEARCH_METRIC_KEYS: readonly (keyof WorkspaceSearchMetrics)[] = [
  'discoveryMs',
  'metadataMs',
  'readMs',
  'scanMs',
  'totalMs',
  'discoveredFiles',
  'scannedFiles',
  'cacheHits',
  'cacheMisses',
]

export interface WorkspaceSearchInstrumentation {
  now(): number
  record(metrics: WorkspaceSearchMetrics): void
}

export interface WorkspaceSearchMetricsTracker {
  addDiscovery(ms: number): void
  addMetadata(ms: number): void
  addRead(ms: number): void
  addScan(ms: number): void
  noteCacheHit(): void
  noteCacheMiss(): void
  readonly cacheHits: number
  readonly cacheMisses: number
}

const roundMs = (value: number): number => Math.round(value * 100) / 100

export const createWorkspaceSearchMetricsTracker = (now: () => number): WorkspaceSearchMetricsTracker & {
  finalize: (counts: { discoveredFiles: number; scannedFiles: number }) => WorkspaceSearchMetrics
} => {
  const startedAt = now()
  let discoveryMs = 0
  let metadataMs = 0
  let readMs = 0
  let scanMs = 0
  let cacheHits = 0
  let cacheMisses = 0
  const tracker: WorkspaceSearchMetricsTracker & {
    finalize: (counts: { discoveredFiles: number; scannedFiles: number }) => WorkspaceSearchMetrics
  } = {
    addDiscovery: (ms) => {
      discoveryMs += ms
    },
    addMetadata: (ms) => {
      metadataMs += ms
    },
    addRead: (ms) => {
      readMs += ms
    },
    addScan: (ms) => {
      scanMs += ms
    },
    noteCacheHit: () => {
      cacheHits += 1
    },
    noteCacheMiss: () => {
      cacheMisses += 1
    },
    get cacheHits() {
      return cacheHits
    },
    get cacheMisses() {
      return cacheMisses
    },
    finalize: (counts) =>
      finalizeWorkspaceSearchMetrics(
        {
          discoveryMs,
          metadataMs,
          readMs,
          scanMs,
          cacheHits,
          cacheMisses,
        },
        counts,
        now,
        startedAt,
      ),
  }
  return tracker
}

export const finalizeWorkspaceSearchMetrics = (
  phases: {
    discoveryMs: number
    metadataMs: number
    readMs: number
    scanMs: number
    cacheHits: number
    cacheMisses: number
  },
  counts: { discoveredFiles: number; scannedFiles: number },
  now: () => number,
  startedAt: number,
): WorkspaceSearchMetrics => ({
  discoveryMs: roundMs(phases.discoveryMs),
  metadataMs: roundMs(phases.metadataMs),
  readMs: roundMs(phases.readMs),
  scanMs: roundMs(phases.scanMs),
  totalMs: roundMs(Math.max(0, now() - startedAt)),
  discoveredFiles: counts.discoveredFiles,
  scannedFiles: counts.scannedFiles,
  cacheHits: phases.cacheHits,
  cacheMisses: phases.cacheMisses,
})

const FORBIDDEN_METRIC_KEYS = new Set<string>(['path', 'query', 'preview', 'content'])

export const isPrivacySafeWorkspaceSearchMetricsJson = (json: string): boolean => {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return false
  }
  if (!parsed || typeof parsed !== 'object') return false
  const record = parsed as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== WORKSPACE_SEARCH_METRIC_KEYS.length) return false
  for (const key of keys) {
    if (!WORKSPACE_SEARCH_METRIC_KEYS.includes(key as keyof WorkspaceSearchMetrics)) return false
    if (FORBIDDEN_METRIC_KEYS.has(key)) return false
  }
  return true
}

export const createRunWorkspaceSearchMetricsState = (instrumentation?: WorkspaceSearchInstrumentation) => {
  if (!instrumentation) {
    return null
  }
  const tracker = createWorkspaceSearchMetricsTracker(instrumentation.now)
  let discoveredFiles = 0
  return {
    now: instrumentation.now,
    tracker,
    setDiscoveredFiles: (count: number) => {
      discoveredFiles = count
    },
    record: (scannedFiles: number) => {
      instrumentation.record(
        tracker.finalize({
          discoveredFiles,
          scannedFiles,
        }),
      )
    },
  }
}
