import { parseDocumentIndex } from './document-index-parser'
import {
  buildResourceDependencyIndex,
  collectDocumentsAffectedByChanges,
  refreshDocumentResources,
  type WorkspaceIndexInvalidation,
} from './workspace-index-resources'
import {
  collectAssetReferences,
  collectTagRecords,
  createEmptyWorkspaceIndex,
} from '../../shared/workspace-index'
import {
  createInitialWorkspaceCoverage,
  markWorkspaceCoverageIncomplete,
} from '../../shared/workspace-coverage'
import type {
  DiagnosticRecord,
  IndexedDocument,
  WorkspaceIndex,
} from '../../shared/workspace-index'
import {
  buildSearchDocumentFromContent,
  tryRetainSearchCorpusDocument,
  type WorkspaceSearchCorpusBudget,
  type WorkspaceSearchDocument,
} from './workspace-search-corpus'
import type {
  WorkspaceFileMeta,
  WorkspaceIndexEvent,
  WorkspaceIndexResult,
  WorkspaceIndexServiceDeps,
} from './workspace-index-service'

export const WORKSPACE_INDEX_SUPERSEDED = 'SUPERSEDED'
export const WORKSPACE_INDEX_CANCELLED = 'CANCELLED'

export interface WorkspaceIndexRefreshState {
  documents: Record<string, IndexedDocument>
  index: WorkspaceIndex | null
  generation: number
  refreshSeq: number
  controller: AbortController | null
  searchDocuments: Map<string, WorkspaceSearchDocument>
  searchCorpusBytes: number
  searchSnapshot: {
    generation: number
    complete: boolean
    documents: readonly WorkspaceSearchDocument[]
  } | null
}

const isAbortErrorLike = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

const readErrorDiagnostic = (path: string, error: unknown): DiagnosticRecord => {
  const message = error instanceof Error ? error.message : '读取失败'
  return {
    id: `READ_ERROR:${path}:0:`,
    code: 'READ_ERROR',
    severity: 'error',
    path,
    message,
  }
}

const relativeTo = (root: string, path: string): string => {
  const normalizedRoot = root.replace(/[\\/]+$/, '')
  if (path.startsWith(normalizedRoot)) {
    const rest = path.slice(normalizedRoot.length)
    return rest.startsWith('/') || rest.startsWith('\\') ? rest.slice(1) : rest
  }
  return path
}

export interface WorkspaceIndexRefreshContext {
  root: string
  state: WorkspaceIndexRefreshState
  signal?: AbortSignal
  invalidation?: WorkspaceIndexInvalidation
  deps: WorkspaceIndexServiceDeps
  maxFiles: number
  maxFileSize: number
  progressInterval: number
  corpusBudget: WorkspaceSearchCorpusBudget
  releaseSearchCorpus: (state: WorkspaceIndexRefreshState) => void
  emit: (root: string, event: WorkspaceIndexEvent) => void
}

export const runWorkspaceIndexRefresh = async (
  context: WorkspaceIndexRefreshContext,
): Promise<WorkspaceIndexResult> => {
  const {
    root,
    state,
    signal,
    invalidation,
    deps,
    maxFiles: MAX_FILES,
    maxFileSize: MAX_FILE_SIZE,
    progressInterval: PROGRESS_INTERVAL,
    corpusBudget,
    releaseSearchCorpus,
    emit,
  } = context

  const generation = state.generation + 1
  const token = ++state.refreshSeq
  state.generation = generation
  state.searchSnapshot = null
  const previousSearchDocuments = new Map(state.searchDocuments)
  releaseSearchCorpus(state)
  const nextSearchDocuments = new Map<string, WorkspaceSearchDocument>()
  let searchCorpusIncomplete = false
  const controller = new AbortController()
  state.controller = controller
  const onOuterAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', onOuterAbort, { once: true })

  const check = (): void => {
    if (token !== state.refreshSeq) {
      throw Object.assign(new Error('过期任务'), { code: WORKSPACE_INDEX_SUPERSEDED })
    }
    if (controller.signal.aborted) {
      throw Object.assign(new Error('已取消'), { code: WORKSPACE_INDEX_CANCELLED })
    }
  }

  try {
    const files = await deps.listMarkdownFiles(root, MAX_FILES + 1)
    check()
    const withinBudget = files.slice(0, MAX_FILES)
    let truncated = files.length > MAX_FILES
    const coverage = createInitialWorkspaceCoverage()
    if (truncated) {
      markWorkspaceCoverageIncomplete(coverage)
      coverage.skipped['file-budget'] += files.length - MAX_FILES
    }
    const dependencyIndex = buildResourceDependencyIndex(state.documents)
    const resourceRevalidate = collectDocumentsAffectedByChanges(
      root,
      state.documents,
      dependencyIndex,
      invalidation,
    )
    const documents: Record<string, IndexedDocument> = {}
    const diagnostics: DiagnosticRecord[] = []
    let scanned = 0
    for (const meta of withinBudget) {
      if (meta.size > MAX_FILE_SIZE) {
        truncated = true
        markWorkspaceCoverageIncomplete(coverage)
        coverage.skipped['file-size'] += 1
        continue
      }
      const previous = state.documents[meta.path]
      if (
        previous &&
        previous.modifiedTime === meta.mtimeMs &&
        previous.size === meta.size
      ) {
        if (resourceRevalidate.has(meta.path)) {
          check()
          documents[meta.path] = await refreshDocumentResources(
            previous,
            root,
            deps.resolveResourcePath,
          )
        } else {
          documents[meta.path] = previous
        }
        const reusedSearch = previousSearchDocuments.get(meta.path)
        if (
          reusedSearch &&
          reusedSearch.mtimeMs === meta.mtimeMs &&
          reusedSearch.size === meta.size
        ) {
          const retained = tryRetainSearchCorpusDocument(
            corpusBudget,
            state.searchCorpusBytes,
            nextSearchDocuments,
            reusedSearch,
          )
          state.searchCorpusBytes = retained.nextRootCorpusBytes
          if (!retained.retained) searchCorpusIncomplete = true
        } else if (documents[meta.path]) {
          searchCorpusIncomplete = true
        }
      } else {
        let content: string
        try {
          content = await deps.readFileText(meta.path)
        } catch (error) {
          truncated = true
          markWorkspaceCoverageIncomplete(coverage)
          coverage.skipped['read-error'] += 1
          diagnostics.push(readErrorDiagnostic(meta.path, error))
          continue
        }
        check()
        const parsed = parseDocumentIndex({
          path: meta.path,
          relativePath: relativeTo(root, meta.path),
          name: meta.path.split(/[\\/]/).pop() ?? meta.path,
          size: meta.size,
          modifiedTime: meta.mtimeMs,
          content,
        })
        for (const ref of parsed.imageRefs) {
          const resolved = await deps.resolveResourcePath(root, ref.target, parsed.path)
          if (resolved) ref.resolvedPath = resolved
          else delete ref.resolvedPath
        }
        for (const link of parsed.outgoingLinks) {
          const resolved = await deps.resolveResourcePath(root, link.target, parsed.path)
          if (resolved) link.resolvedPath = resolved
          else delete link.resolvedPath
        }
        documents[meta.path] = parsed
        const searchDoc = buildSearchDocumentFromContent(
          meta.path,
          meta.size,
          meta.mtimeMs,
          content,
        )
        const retained = tryRetainSearchCorpusDocument(
          corpusBudget,
          state.searchCorpusBytes,
          nextSearchDocuments,
          searchDoc,
        )
        state.searchCorpusBytes = retained.nextRootCorpusBytes
        if (!retained.retained) searchCorpusIncomplete = true
      }
      coverage.scannedFiles += 1
      scanned++
      if (scanned % PROGRESS_INTERVAL === 0 || scanned === withinBudget.length) {
        emit(root, { type: 'progress', generation, scanned, total: withinBudget.length })
      }
    }
    check()

    const index: WorkspaceIndex = {
      ...createEmptyWorkspaceIndex(root),
      generatedAt: new Date().toISOString(),
      generation,
      complete: !truncated,
      truncated,
      coverage: { ...coverage, complete: !truncated },
      documents,
      links: Object.values(documents).flatMap((doc) =>
        doc.outgoingLinks.map((link) => ({
          sourcePath: doc.path,
          target: link.target,
          line: link.line,
          resolvedPath: link.resolvedPath,
          kind: link.kind,
        })),
      ),
      tags: collectTagRecords(documents),
      assets: collectAssetReferences(documents),
      diagnostics,
    }

    state.documents = documents
    state.index = index
    state.searchDocuments = nextSearchDocuments
    state.searchSnapshot = {
      generation,
      complete: !truncated && !searchCorpusIncomplete,
      documents: Array.from(nextSearchDocuments.values()),
    }
    emit(root, { type: 'updated', index })
    void deps.cacheStore?.save(root, index).catch(() => undefined)

    return {
      index,
      generation,
      complete: !truncated,
      truncated,
    }
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === WORKSPACE_INDEX_SUPERSEDED) throw error
    const failedCode =
      code === WORKSPACE_INDEX_CANCELLED || isAbortErrorLike(error)
        ? WORKSPACE_INDEX_CANCELLED
        : 'INDEX_FAILED'
    emit(root, { type: 'failed', generation, code: failedCode })
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      code: failedCode,
    })
  } finally {
    signal?.removeEventListener('abort', onOuterAbort)
    if (state.controller === controller) state.controller = null
  }
}

export type { WorkspaceFileMeta }
