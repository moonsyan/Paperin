/**
 * 工作区增量索引服务（Track C / Task 9）。
 *
 * 按工作区维护当前索引快照与 generation：
 * - 增量：mtime+size 未变化的文件直接复用既有解析结果，不重读内容；
 * - 竞态：refresh 串行执行，旧任务在恢复点检查 token，过期结果静默丢弃，
 *   任何完成路径都不能覆盖更新 generation 的快照；
 * - 取消：AbortSignal / cancel() 立即中止扫描（CANCELLED）；
 * - 预算：文件数 / 单文件大小超限时 truncated=true，绝不把截断结果标为完整；
 * - 事件：progress / updated / failed 经 subscribe 按工作区分发。
 *
 * 索引缓存通过 WorkspaceIndexCacheStore 注入：磁盘实现写在 Electron 用户
 * 数据目录（按工作区路径哈希键控），绝不向用户工作区写隐藏文件，避免
 * 污染 Obsidian 等共用笔记目录与网盘同步。缓存可删除、可直接重建。
 */

import type { WorkspaceIndexInvalidation } from './workspace-index-resources'
import {
  createInitialWorkspaceCoverage,
  markWorkspaceCoverageIncomplete,
  WORKSPACE_SCAN_MAX_FILE_BYTES,
} from '../../shared/workspace-coverage'
import type { WorkspaceIndex, WorkspaceIndexEvent as SharedWorkspaceIndexEvent } from '../../shared/workspace-index'
import {
  DEFAULT_WORKSPACE_SEARCH_CORPUS_PER_ROOT_BYTES,
  DEFAULT_WORKSPACE_SEARCH_CORPUS_PROCESS_BYTES,
  WorkspaceSearchCorpusBudget,
  type WorkspaceSearchDocument,
  type WorkspaceSearchSnapshot,
} from './workspace-search-corpus'
import { runWorkspaceIndexRefresh, type WorkspaceIndexRefreshState } from './workspace-index-refresh'

export type { WorkspaceSearchDocument, WorkspaceSearchSnapshot } from './workspace-search-corpus'
export { createFileWorkspaceIndexCache } from './workspace-index-cache'

export interface WorkspaceIndexResult {
  index: WorkspaceIndex
  generation: number
  complete: boolean
  truncated: boolean
}

export type WorkspaceIndexEvent = SharedWorkspaceIndexEvent

export interface WorkspaceFileMeta {
  path: string
  size: number
  mtimeMs: number
}

import type { WorkspaceIndexCacheStore } from './workspace-index-cache'

export type { WorkspaceIndexCacheStore } from './workspace-index-cache'

export interface WorkspaceIndexServiceDeps {
  listMarkdownFiles(root: string, limit?: number): Promise<WorkspaceFileMeta[]>
  readFileText(path: string): Promise<string>
  /** 解析相对资源引用到工作区内绝对路径；解析失败返回 null（MISSING_ASSET 诊断素材） */
  resolveResourcePath(root: string, target: string, sourcePath?: string): Promise<string | null>
  cacheStore?: WorkspaceIndexCacheStore
  maxFiles?: number
  maxFileSize?: number
}

export interface WorkspaceIndexService {
  /** 从缓存或内存恢复索引；无任何记录时返回 null */
  load(root: string): Promise<WorkspaceIndex | null>
  refresh(
    root: string,
    options?: { signal?: AbortSignal; invalidation?: WorkspaceIndexInvalidation },
  ): Promise<WorkspaceIndexResult>
  cancel(root: string): void
  subscribe(root: string, listener: (event: WorkspaceIndexEvent) => void): () => void
  /** 同根多窗口共享语料；打开工作区时 retain，关闭时 release */
  retain(root: string): void
  release(root: string): void
  /** 当前 generation 的 Main-only 搜索语料；未就绪或已 dispose 时为 null */
  getSearchSnapshot(root: string): WorkspaceSearchSnapshot | null
  dispose(root?: string): void
}

interface WorkspaceIndexState extends WorkspaceIndexRefreshState {
  running: Promise<void>
  refCount: number
}

/** 产品预算覆盖阶段 5 的 5000 文件验收场景；第 5001 个文件触发截断。 */
export const DEFAULT_WORKSPACE_INDEX_MAX_FILES = 5000

export const createWorkspaceIndexService = (
  deps: WorkspaceIndexServiceDeps,
  options?: {
    maxFiles?: number
    maxFileSize?: number
    searchCorpusPerRootBytes?: number
    searchCorpusProcessBytes?: number
  },
): WorkspaceIndexService => {
  const MAX_FILES = options?.maxFiles ?? DEFAULT_WORKSPACE_INDEX_MAX_FILES
  const MAX_FILE_SIZE = options?.maxFileSize ?? WORKSPACE_SCAN_MAX_FILE_BYTES
  const CORPUS_PER_ROOT = options?.searchCorpusPerRootBytes ?? DEFAULT_WORKSPACE_SEARCH_CORPUS_PER_ROOT_BYTES
  const CORPUS_PROCESS = options?.searchCorpusProcessBytes ?? DEFAULT_WORKSPACE_SEARCH_CORPUS_PROCESS_BYTES
  const PROGRESS_INTERVAL = 50

  const states = new Map<string, WorkspaceIndexState>()
  const listeners = new Map<string, Set<(event: WorkspaceIndexEvent) => void>>()
  const corpusBudget = new WorkspaceSearchCorpusBudget(CORPUS_PER_ROOT, CORPUS_PROCESS)

  const releaseSearchCorpusForState = (state: WorkspaceIndexRefreshState): void => {
    if (state.searchCorpusBytes <= 0) {
      state.searchDocuments.clear()
      state.searchSnapshot = null
      return
    }
    corpusBudget.releaseRoot(state.searchCorpusBytes)
    state.searchCorpusBytes = 0
    state.searchDocuments.clear()
    state.searchSnapshot = null
  }

  const stateOf = (root: string): WorkspaceIndexState => {
    let state = states.get(root)
    if (!state) {
      state = {
        documents: {},
        index: null,
        generation: 0,
        refreshSeq: 0,
        running: Promise.resolve(),
        controller: null,
        refCount: 0,
        searchDocuments: new Map(),
        searchCorpusBytes: 0,
        searchSnapshot: null,
      }
      states.set(root, state)
    }
    return state
  }

  const emit = (root: string, event: WorkspaceIndexEvent): void => {
    const set = listeners.get(root)
    if (!set) return
    set.forEach((listener) => {
      try {
        listener(event)
      } catch {
        // 单个监听者异常不阻断事件分发
      }
    })
  }

  const refreshOne = (
    root: string,
    state: WorkspaceIndexState,
    signal?: AbortSignal,
    invalidation?: WorkspaceIndexInvalidation,
  ) =>
    runWorkspaceIndexRefresh({
      root,
      state,
      signal,
      invalidation,
      deps,
      maxFiles: MAX_FILES,
      maxFileSize: MAX_FILE_SIZE,
      progressInterval: PROGRESS_INTERVAL,
      corpusBudget,
      releaseSearchCorpus: releaseSearchCorpusForState,
      emit,
    })

  return {
    async load(root) {
      const normalize = (index: WorkspaceIndex): WorkspaceIndex => {
        if (index.coverage) return index
        const coverage = createInitialWorkspaceCoverage()
        coverage.complete = index.complete
        coverage.scannedFiles = Object.keys(index.documents).length
        if (!index.complete) markWorkspaceCoverageIncomplete(coverage)
        return { ...index, coverage }
      }
      const state = states.get(root)
      if (state?.index) return normalize(state.index)
      const cached = await deps.cacheStore?.load(root)
      const normalized = cached ? normalize(cached) : null
      if (normalized && state) {
        state.index = normalized
        state.generation = normalized.generation
      }
      return normalized ?? (state?.index ? normalize(state.index) : null)
    },

    refresh(root, requestOptions) {
      const state = stateOf(root)
      // 串行队列：并发 refresh 依次执行，配合 token 丢弃过期结果
      const run = state.running.then(() =>
        refreshOne(root, state, requestOptions?.signal, requestOptions?.invalidation),
      )
      state.running = run.then(
        () => undefined,
        () => undefined,
      )
      return run
    },

    cancel(root) {
      states.get(root)?.controller?.abort()
    },

    subscribe(root, listener) {
      let set = listeners.get(root)
      if (!set) {
        set = new Set()
        listeners.set(root, set)
      }
      set.add(listener)
      return () => {
        set?.delete(listener)
        if (set && set.size === 0) listeners.delete(root)
      }
    },

    retain(root) {
      stateOf(root).refCount += 1
    },

    release(root) {
      const state = states.get(root)
      if (!state) return
      state.refCount = Math.max(0, state.refCount - 1)
      if (state.refCount > 0) return
      state.controller?.abort()
      releaseSearchCorpusForState(state)
      states.delete(root)
      listeners.delete(root)
      void deps.cacheStore?.clear(root).catch(() => undefined)
    },

    getSearchSnapshot(root) {
      return states.get(root)?.searchSnapshot ?? null
    },

    dispose(root) {
      if (root === undefined) {
        for (const key of Array.from(states.keys())) this.dispose(key)
        return
      }
      const state = states.get(root)
      if (!state) return
      state.refCount = 0
      state.controller?.abort()
      releaseSearchCorpusForState(state)
      states.delete(root)
      listeners.delete(root)
      void deps.cacheStore?.clear(root).catch(() => undefined)
    },
  }
}
