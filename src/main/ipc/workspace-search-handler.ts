import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'
import { stat } from 'fs/promises'
import { CHANNELS } from '../../shared/ipc/channels'
import {
  createInitialWorkspaceCoverage,
  markWorkspaceCoverageIncomplete,
  WORKSPACE_SCAN_MAX_FILE_BYTES,
  workspaceCoverageLegacyFlags,
  type WorkspaceCoverage,
} from '../../shared/workspace-coverage'
import { DEFAULT_WORKSPACE_INDEX_MAX_FILES } from '../indexing/workspace-index-service'
import {
  FileIdentityChangedError,
  readTextAutoEncoding,
  walkMarkdownTree,
  type FolderTreeNode,
  type TreeBudget,
} from './file-io'
import { cacheSearchLines, getCachedSearchLines, runSharedRegexSearch } from './search-regex'
import {
  createRunWorkspaceSearchMetricsState,
  type WorkspaceSearchInstrumentation,
} from './workspace-search-metrics'
import type { WorkspaceSearchSnapshot } from '../indexing/workspace-search-corpus'
import { recordSupportIpcFailure } from '../support/support-ipc-tracking'

export const WORKSPACE_SEARCH_MAX_MATCHES = 200

export interface WorkspaceSearchLimits {
  maxFiles: number
  maxFileBytes: number
  maxMatches: number
}

export const DEFAULT_WORKSPACE_SEARCH_LIMITS: WorkspaceSearchLimits = {
  maxFiles: DEFAULT_WORKSPACE_INDEX_MAX_FILES,
  maxFileBytes: WORKSPACE_SCAN_MAX_FILE_BYTES,
  maxMatches: WORKSPACE_SEARCH_MAX_MATCHES,
}

export interface WorkspaceSearchMatch {
  path: string
  line: number
  preview: string
}

export interface WorkspaceSearchSuccess {
  matches: WorkspaceSearchMatch[]
  coverage: WorkspaceCoverage
  truncated: boolean
  scanTruncated: boolean
  matchCapped: boolean
}

export interface WorkspaceSearchArgs {
  dir: string
  query: string
  caseSensitive?: boolean
  regex?: boolean
  queryId?: number
  cancel?: boolean
}

export interface WorkspaceSearchHandlerDependencies {
  withinWindow(event: IpcMainInvokeEvent, candidate: string): Promise<boolean>
  getSearchSnapshot(root: string): WorkspaceSearchSnapshot | null
}

export interface WorkspaceSearchRuntimeDeps {
  getSearchSnapshot?: (root: string) => WorkspaceSearchSnapshot | null
}

interface ActiveSearch {
  queryId: number
  abort: AbortController
}

const activeSearchBySender = new Map<number, ActiveSearch>()

const flattenMarkdownPaths = (nodes: FolderTreeNode[]): string[] => {
  const paths: string[] = []
  const visit = (list: FolderTreeNode[]) => {
    for (const node of list) {
      if (node.children) {
        visit(node.children)
        continue
      }
      paths.push(node.path)
    }
  }
  visit(nodes)
  return paths
}

const beginSearch = (senderId: number, queryId: number | undefined): { signal: AbortSignal; isStale: () => boolean } => {
  const prev = activeSearchBySender.get(senderId)
  prev?.abort.abort()
  const abort = new AbortController()
  const resolvedId = queryId ?? Date.now()
  activeSearchBySender.set(senderId, { queryId: resolvedId, abort })
  return {
    signal: abort.signal,
    isStale: () => activeSearchBySender.get(senderId)?.queryId !== resolvedId,
  }
}

export const cancelWorkspaceSearch = (senderId: number): void => {
  activeSearchBySender.get(senderId)?.abort.abort()
  activeSearchBySender.delete(senderId)
}

export const runWorkspaceSearch = async (
  args: WorkspaceSearchArgs,
  limits: WorkspaceSearchLimits = DEFAULT_WORKSPACE_SEARCH_LIMITS,
  isStale?: () => boolean,
  signal?: AbortSignal,
  instrumentation?: WorkspaceSearchInstrumentation,
  runtime?: WorkspaceSearchRuntimeDeps,
): Promise<WorkspaceSearchSuccess> => {
  const coverage = createInitialWorkspaceCoverage()
  const matches: WorkspaceSearchMatch[] = []
  const metrics = createRunWorkspaceSearchMetricsState(instrumentation)
  const recordMetrics = () => metrics?.record(coverage.scannedFiles)
  const throwCancelled = () => {
    recordMetrics()
    throw Object.assign(new Error('已取消'), { code: 'CANCELLED' })
  }
  const query = args.query.trim()
  if (!query) {
    metrics?.setDiscoveredFiles(0)
    recordMetrics()
    return { matches, coverage, ...workspaceCoverageLegacyFlags(coverage) }
  }

  const treeBudget: TreeBudget = { nodes: 0, truncated: false }
  const discoveryStart = metrics?.now() ?? 0
  const tree = await walkMarkdownTree(args.dir, 0, treeBudget, {
    maxFiles: limits.maxFiles + 1,
  })
  if (metrics) {
    metrics.tracker.addDiscovery(Math.max(0, metrics.now() - discoveryStart))
  }
  if (signal?.aborted) throwCancelled()

  const paths = flattenMarkdownPaths(tree)
  const discovered = paths.length
  metrics?.setDiscoveredFiles(discovered)
  const scanPaths = paths.slice(0, limits.maxFiles)

  if (treeBudget.truncated) {
    markWorkspaceCoverageIncomplete(coverage)
    const fileBudgetExceeded = (treeBudget.files ?? 0) > limits.maxFiles
    if (fileBudgetExceeded) {
      coverage.skipped['file-budget'] += Math.max(1, discovered - limits.maxFiles)
    } else {
      coverage.skipped.depth += 1
    }
  } else if (discovered > limits.maxFiles) {
    markWorkspaceCoverageIncomplete(coverage)
    coverage.skipped['file-budget'] += discovered - limits.maxFiles
  }

  const needle = args.caseSensitive ? query : query.toLowerCase()
  let stoppedEarly = false
  const searchSnapshot = runtime?.getSearchSnapshot?.(args.dir) ?? null
  const corpusByPath = searchSnapshot
    ? new Map(searchSnapshot.documents.map((document) => [document.path, document]))
    : null
  if (searchSnapshot && !searchSnapshot.complete) {
    markWorkspaceCoverageIncomplete(coverage)
  }

  for (const path of scanPaths) {
    if (signal?.aborted || isStale?.()) throwCancelled()
    const corpusDoc = corpusByPath?.get(path)
    let fileStat: Awaited<ReturnType<typeof stat>> | null = null
    if (corpusDoc) {
      if (corpusDoc.size > limits.maxFileBytes) {
        markWorkspaceCoverageIncomplete(coverage)
        coverage.skipped['file-size'] += 1
        continue
      }
    } else {
      const metadataStart = metrics?.now() ?? 0
      fileStat = await stat(path).catch(() => null)
      if (metrics) {
        metrics.tracker.addMetadata(Math.max(0, metrics.now() - metadataStart))
      }
      if (!fileStat?.isFile()) {
        markWorkspaceCoverageIncomplete(coverage)
        coverage.skipped['read-error'] += 1
        continue
      }
      if (fileStat.size > limits.maxFileBytes) {
        markWorkspaceCoverageIncomplete(coverage)
        coverage.skipped['file-size'] += 1
        continue
      }
    }

    if (args.regex) {
      let content: string
      if (corpusDoc) {
        content = corpusDoc.lines.join('\n')
        metrics?.tracker.noteCacheHit()
      } else {
      try {
        const readStart = metrics?.now() ?? 0
        ;({ content } = await readTextAutoEncoding(path))
        if (metrics) {
          metrics.tracker.addRead(Math.max(0, metrics.now() - readStart))
          metrics.tracker.noteCacheMiss()
        }
      } catch (error) {
        if (error instanceof FileIdentityChangedError) {
          markWorkspaceCoverageIncomplete(coverage)
          coverage.skipped['read-error'] += 1
          continue
        }
        markWorkspaceCoverageIncomplete(coverage)
        coverage.skipped['read-error'] += 1
        continue
      }
      }
      const scanStart = metrics?.now() ?? 0
      const regexMatches = await runSharedRegexSearch(
        content,
        query,
        Boolean(args.caseSensitive),
        limits.maxMatches - matches.length,
      )
      if (metrics) {
        metrics.tracker.addScan(Math.max(0, metrics.now() - scanStart))
      }
      coverage.scannedFiles += 1
      for (const match of regexMatches) matches.push({ path, ...match })
      if (matches.length >= limits.maxMatches) {
        coverage.matchCapped = true
        markWorkspaceCoverageIncomplete(coverage)
        stoppedEarly = true
        break
      }
      continue
    }

    let lines: string[]
    if (corpusDoc) {
      lines = [...corpusDoc.lines]
      metrics?.tracker.noteCacheHit()
    } else {
    const cached = getCachedSearchLines(path)
    const mtimeSettled = fileStat ? Date.now() - fileStat.mtimeMs > 2500 : false
    if (cached && mtimeSettled && fileStat && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
      lines = cached.lines
      metrics?.tracker.noteCacheHit()
    } else {
      let content: string
      try {
        const readStart = metrics?.now() ?? 0
        ;({ content } = await readTextAutoEncoding(path))
        if (metrics) {
          metrics.tracker.addRead(Math.max(0, metrics.now() - readStart))
          metrics.tracker.noteCacheMiss()
        }
      } catch (error) {
        if (error instanceof FileIdentityChangedError) {
          markWorkspaceCoverageIncomplete(coverage)
          coverage.skipped['read-error'] += 1
          continue
        }
        markWorkspaceCoverageIncomplete(coverage)
        coverage.skipped['read-error'] += 1
        continue
      }
      lines = content.split(/\r?\n/)
      if (mtimeSettled && fileStat) {
        cacheSearchLines(path, {
          mtimeMs: fileStat.mtimeMs,
          size: fileStat.size,
          lines,
        })
      }
    }
    }
    coverage.scannedFiles += 1
    const scanStart = metrics?.now() ?? 0
    for (let index = 0; index < lines.length; index++) {
      const candidate = args.caseSensitive ? lines[index] : lines[index].toLowerCase()
      if (!candidate.includes(needle)) continue
      matches.push({ path, line: index + 1, preview: lines[index].trim().slice(0, 120) })
      if (matches.length >= limits.maxMatches) {
        coverage.matchCapped = true
        markWorkspaceCoverageIncomplete(coverage)
        stoppedEarly = true
        break
      }
    }
    if (metrics) {
      metrics.tracker.addScan(Math.max(0, metrics.now() - scanStart))
    }
    if (stoppedEarly) break
  }

  if (stoppedEarly && scanPaths.length > coverage.scannedFiles) {
    markWorkspaceCoverageIncomplete(coverage)
  }

  recordMetrics()
  return { matches, coverage, ...workspaceCoverageLegacyFlags(coverage) }
}

export const registerWorkspaceSearchHandler = ({
  withinWindow,
  getSearchSnapshot,
}: WorkspaceSearchHandlerDependencies): void => {
  ipcMain.handle(CHANNELS.FILE_SEARCH_WORKSPACE, async (event, args: WorkspaceSearchArgs) => {
    try {
      const senderId = event.sender.id
      if (args?.cancel) {
        cancelWorkspaceSearch(senderId)
        return { ok: true, data: { matches: [], coverage: createInitialWorkspaceCoverage(), truncated: false } }
      }
      if (
        !args ||
        typeof args.dir !== 'string' ||
        !args.dir ||
        typeof args.query !== 'string' ||
        !(await withinWindow(event, args.dir))
      ) {
        return { ok: false, error: { code: 'INVALID_TARGET' } }
      }
      const dirStat = await stat(args.dir).catch(() => null)
      if (!dirStat) return { ok: false, error: { code: 'NOT_FOUND' } }
      if (!dirStat.isDirectory()) return { ok: false, error: { code: 'NOT_DIRECTORY' } }
      const query = args.query.trim()
      if (!query) {
        const coverage = createInitialWorkspaceCoverage()
        return { ok: true, data: { matches: [], coverage, ...workspaceCoverageLegacyFlags(coverage) } }
      }
      if (query.length > 256) {
        return {
          ok: false,
          error: { code: 'QUERY_TOO_LONG', message: '搜索关键词不能超过 256 个字符' },
        }
      }
      if (args.regex) {
        try {
          new RegExp(query, args.caseSensitive ? '' : 'i')
        } catch {
          return {
            ok: false,
            error: { code: 'INVALID_REGEX', message: '正则表达式不合法' },
          }
        }
      }

      const { signal, isStale } = beginSearch(senderId, args.queryId)
      try {
        const data = await runWorkspaceSearch(
          args,
          DEFAULT_WORKSPACE_SEARCH_LIMITS,
          isStale,
          signal,
          undefined,
          { getSearchSnapshot },
        )
        if (isStale()) {
          recordSupportIpcFailure('CANCELLED', {
            failureEvent: 'search_cancelled',
            recordCancelledError: true,
          })
          return { ok: false, error: { code: 'CANCELLED', message: '搜索已取消' } }
        }
        return { ok: true, data }
      } catch (error) {
        if ((error as { code?: string }).code === 'CANCELLED' || isStale()) {
          recordSupportIpcFailure('CANCELLED', {
            failureEvent: 'search_cancelled',
            recordCancelledError: true,
          })
          return { ok: false, error: { code: 'CANCELLED', message: '搜索已取消' } }
        }
        if (error instanceof Error && error.message === 'REGEX_TIMEOUT') {
          return {
            ok: false,
            error: { code: 'REGEX_TIMEOUT', message: '正则表达式匹配超时，请简化表达式' },
          }
        }
        throw error
      }
    } catch (error) {
      return { ok: false, error: { code: 'IO_ERROR', message: String(error) } }
    }
  })
}
