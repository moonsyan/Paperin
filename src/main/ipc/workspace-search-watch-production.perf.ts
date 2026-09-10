import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import { performance } from 'perf_hooks'
import { ipcMain } from 'electron'
import { CHANNELS } from '../../shared/ipc/channels'
import { createWorkspaceIndexFilesystemDependencies } from '../indexing/workspace-index-filesystem'
import { createWorkspaceIndexService } from '../indexing/workspace-index-service'
import { createWorkspaceFileWatcher } from '../indexing/workspace-file-watcher'
import { registerWorkspaceHandlers } from './workspace-handlers'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { trashItem: vi.fn() },
}))

interface WorkspaceSearchResult {
  ok: boolean
  data?: { matches: Array<{ path: string; line: number; preview: string }>; truncated: boolean }
}

type SearchHandler = (event: unknown, args: unknown) => Promise<WorkspaceSearchResult>

const DOCUMENTS = 5000
const WATCH_EVENT_COUNT = 20_000
const WATCH_SAMPLES = 5
const thresholdPath = resolve('docs/development/workspace-search-watch-performance-baseline.json')

interface PerformanceThresholds {
  scenario: { documents: number; watcherEvents: number; watcherSamples: number }
  targets: { searchP95Ms: number; watcherStableP95Ms: number }
}

let root = ''
let thresholds: PerformanceThresholds

const createContent = (index: number): string => {
  const marker = index === DOCUMENTS - 1 ? 'needle-at-the-end-of-the-workspace' : 'ordinary workspace text'
  return `# Document ${index}\n\n#performance\n\n${marker}\n`
}

const percentile95 = (samples: number[]): number => {
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
}

const getSearchHandler = (): SearchHandler => {
  const registered = vi.mocked(ipcMain.handle).mock.calls.find(
    ([channel]) => channel === CHANNELS.FILE_SEARCH_WORKSPACE,
  )
  if (!registered) throw new Error('workspace search handler was not registered')
  return registered[1] as unknown as SearchHandler
}

beforeAll(async () => {
  thresholds = JSON.parse(await readFile(thresholdPath, 'utf-8')) as PerformanceThresholds
  expect(thresholds.scenario).toEqual({
    documents: DOCUMENTS,
    watcherEvents: WATCH_EVENT_COUNT,
    watcherSamples: WATCH_SAMPLES,
  })
  root = await mkdtemp(join(tmpdir(), 'lfh-production-search-watch-perf-'))
  const batchSize = 200
  for (let start = 0; start < DOCUMENTS; start += batchSize) {
    await Promise.all(
      Array.from({ length: Math.min(batchSize, DOCUMENTS - start) }, (_, offset) => {
        const index = start + offset
        return writeFile(join(root, `${String(index).padStart(5, '0')}.md`), createContent(index), 'utf-8')
      }),
    )
  }
}, 120_000)

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(ipcMain.handle).mockClear()
})

describe('production workspace search and watcher performance gate', () => {
  it('search IPC traverses a 5000-file workspace and finds a marker in the final file', async () => {
    registerWorkspaceHandlers({
      hasWorkspaceRoot: () => true,
      setWorkspaceRoot: () => undefined,
      clearWorkspaceRoot: () => undefined,
      workspaceRootFor: () => root,
      isTrustedPath: () => true,
    })
    const search = getSearchHandler()
    const samples: number[] = []
    let result: WorkspaceSearchResult | undefined

    for (let run = 0; run < 3; run++) {
      const startedAt = performance.now()
      result = await search(
        { sender: { id: 73 } },
        { dir: root, query: 'needle-at-the-end-of-the-workspace' },
      )
      samples.push(performance.now() - startedAt)
    }

    expect(result).toEqual(expect.objectContaining({ ok: true }))
    expect(result?.data?.matches).toEqual([
      expect.objectContaining({ path: join(root, '04999.md'), line: 5 }),
    ])
    expect(result?.data?.truncated).toBe(false)

    const searchP95Ms = percentile95(samples)
    console.log(`PRODUCTION_SEARCH_PERF_METRICS ${JSON.stringify({ documents: DOCUMENTS, searchP95Ms })}`)
    expect(searchP95Ms).toBeLessThanOrEqual(thresholds.targets.searchP95Ms)
  }, 120_000)

  it('coalesces a 20k-event watcher storm into stable, deduplicated warm index refreshes', async () => {
    const service = createWorkspaceIndexService(createWorkspaceIndexFilesystemDependencies())
    await service.refresh(root)
    let emit: ((paths: string[]) => void) | undefined
    const watcher = createWorkspaceFileWatcher({
      debounceMs: 5,
      watch: (_watchRoot, onChange) => {
        emit = onChange
        return () => undefined
      },
    })
    const samples: number[] = []
    const batches: number[] = []
    let settle: (() => void) | undefined
    watcher.start(root, (paths) => {
      batches.push(paths.length)
      void service.refresh(root).then(() => settle?.())
    })

    for (let run = 0; run < WATCH_SAMPLES; run++) {
      const settled = new Promise<void>((resolve) => { settle = resolve })
      const startedAt = performance.now()
      for (let event = 0; event < WATCH_EVENT_COUNT; event++) {
        emit?.([join(root, `${String(event % DOCUMENTS).padStart(5, '0')}.md`)])
      }
      await settled
      samples.push(performance.now() - startedAt)
    }
    watcher.stop()

    expect(batches).toEqual(Array.from({ length: WATCH_SAMPLES }, () => DOCUMENTS))
    const watcherStableP95Ms = percentile95(samples)
    console.log(
      `PRODUCTION_WATCH_PERF_METRICS ${JSON.stringify({ documents: DOCUMENTS, events: WATCH_EVENT_COUNT, watcherStableP95Ms })}`,
    )
    expect(watcherStableP95Ms).toBeLessThanOrEqual(thresholds.targets.watcherStableP95Ms)
  }, 120_000)
})
