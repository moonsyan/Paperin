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

import { createHash } from 'crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { parseDocumentIndex } from './document-index-parser'
import {
  collectAssetReferences,
  collectTagRecords,
  createEmptyWorkspaceIndex,
} from '../../shared/workspace-index'
import {
  createInitialWorkspaceCoverage,
  markWorkspaceCoverageIncomplete,
  WORKSPACE_SCAN_MAX_FILE_BYTES,
} from '../../shared/workspace-coverage'
import type { IndexedDocument, WorkspaceIndex, WorkspaceIndexEvent as SharedWorkspaceIndexEvent } from '../../shared/workspace-index'

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

export interface WorkspaceIndexCacheStore {
  load(root: string): Promise<WorkspaceIndex | null>
  save(root: string, index: WorkspaceIndex): Promise<void>
  clear(root: string): Promise<void>
}

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
  refresh(root: string, options?: { signal?: AbortSignal }): Promise<WorkspaceIndexResult>
  cancel(root: string): void
  subscribe(root: string, listener: (event: WorkspaceIndexEvent) => void): () => void
  dispose(root?: string): void
}

interface WorkspaceIndexState {
  documents: Record<string, IndexedDocument>
  index: WorkspaceIndex | null
  generation: number
  refreshSeq: number
  running: Promise<void>
  controller: AbortController | null
}

const SUPERSEDED = 'SUPERSEDED'
const CANCELLED = 'CANCELLED'

/** 产品预算覆盖阶段 5 的 5000 文件验收场景；第 5001 个文件触发截断。 */
export const DEFAULT_WORKSPACE_INDEX_MAX_FILES = 5000

const isAbortErrorLike = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

export const createWorkspaceIndexService = (
  deps: WorkspaceIndexServiceDeps,
  options?: { maxFiles?: number; maxFileSize?: number },
): WorkspaceIndexService => {
  const MAX_FILES = options?.maxFiles ?? DEFAULT_WORKSPACE_INDEX_MAX_FILES
  const MAX_FILE_SIZE = options?.maxFileSize ?? WORKSPACE_SCAN_MAX_FILE_BYTES
  const PROGRESS_INTERVAL = 50

  const states = new Map<string, WorkspaceIndexState>()
  const listeners = new Map<string, Set<(event: WorkspaceIndexEvent) => void>>()

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

  const refreshOne = async (
    root: string,
    state: WorkspaceIndexState,
    signal?: AbortSignal,
  ): Promise<WorkspaceIndexResult> => {
    const generation = state.generation + 1
    const token = ++state.refreshSeq
    state.generation = generation
    const controller = new AbortController()
    state.controller = controller
    // 外部 signal 与内部 cancel 双向联动；外部在 refresh 开始前已 abort 时
    // addEventListener 不再触发，必须立即同步传播
    const onOuterAbort = () => controller.abort()
    if (signal?.aborted) controller.abort()
    else signal?.addEventListener('abort', onOuterAbort, { once: true })

    const check = (): void => {
      if (token !== state.refreshSeq) throw Object.assign(new Error('过期任务'), { code: SUPERSEDED })
      if (controller.signal.aborted) throw Object.assign(new Error('已取消'), { code: CANCELLED })
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
      const documents: Record<string, IndexedDocument> = {}
      // 未变化文件直接迁移旧解析结果（保留对象引用，供增量断言与省 IO）
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
          documents[meta.path] = previous
        } else {
          let content: string
          try {
            content = await deps.readFileText(meta.path)
          } catch (error) {
            // 读取期间路径被换成链接时跳过这一篇，不能让单文件失败拖垮整库索引。
            if (error instanceof Error && error.name === 'FileIdentityChangedError') {
              truncated = true
              markWorkspaceCoverageIncomplete(coverage)
              coverage.skipped['read-error'] += 1
              continue
            }
            markWorkspaceCoverageIncomplete(coverage)
            coverage.skipped['read-error'] += 1
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
          }
          for (const link of parsed.outgoingLinks) {
            const resolved = await deps.resolveResourcePath(root, link.target, parsed.path)
            if (resolved) link.resolvedPath = resolved
          }
          documents[meta.path] = parsed
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
      }

      state.documents = documents
      state.index = index
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
      if (code === SUPERSEDED) throw error
      const failedCode = code === CANCELLED || isAbortErrorLike(error) ? CANCELLED : 'INDEX_FAILED'
      emit(root, { type: 'failed', generation, code: failedCode })
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
        code: failedCode,
      })
    } finally {
      signal?.removeEventListener('abort', onOuterAbort)
      if (state.controller === controller) state.controller = null
    }
  }

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
        refreshOne(root, state, requestOptions?.signal),
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

    dispose(root) {
      if (root === undefined) {
        for (const key of Array.from(states.keys())) this.dispose(key)
        return
      }
      const state = states.get(root)
      if (!state) return
      state.controller?.abort()
      states.delete(root)
      listeners.delete(root)
      void deps.cacheStore?.clear(root).catch(() => undefined)
    },
  }
}

/** 相对路径计算（POSIX 风格分隔符），供解析器 relativePath 字段使用 */
const relativeTo = (root: string, path: string): string => {
  const normalizedRoot = root.replace(/[\\/]+$/, '')
  if (path.startsWith(normalizedRoot)) {
    const rest = path.slice(normalizedRoot.length)
    return rest.startsWith('/') || rest.startsWith('\\') ? rest.slice(1) : rest
  }
  return path
}

/* ==================== 磁盘缓存（Electron 用户数据目录） ==================== */

/** 缓存文件体积上限：超出时拒绝写入（删除即可重建，索引不承载持久事实） */
const MAX_CACHE_FILE_BYTES = 8 * 1024 * 1024

/**
 * 文件缓存实现：`<cacheDir>/<sha1(root)>.json`，原子写入（tmp+rename）。
 * getCacheDir 由装配方注入 Electron `app.getPath('userData')` 下的子目录，
 * 本文件自身不导入 Electron，可在单测中用临时目录验证。
 */
export const createFileWorkspaceIndexCache = (
  getCacheDir: () => string,
): WorkspaceIndexCacheStore => {
  const cacheFile = (root: string): string =>
    join(getCacheDir(), `${createHash('sha1').update(root).digest('hex')}.json`)

  return {
    async load(root) {
      try {
        const raw = await readFile(cacheFile(root), 'utf-8')
        if (raw.length > MAX_CACHE_FILE_BYTES) return null
        const parsed = JSON.parse(raw) as WorkspaceIndex | null
        if (!parsed || typeof parsed !== 'object' || !parsed.documents) return null
        return parsed
      } catch {
        return null
      }
    },

    async save(root, index) {
      const file = cacheFile(root)
      const payload = JSON.stringify({ ...index, diagnostics: index.diagnostics })
      if (payload.length > MAX_CACHE_FILE_BYTES) return
      try {
        await mkdir(dirname(file), { recursive: true })
        const tmp = `${file}.${process.pid}.tmp`
        await writeFile(tmp, payload, 'utf-8')
        await rename(tmp, file)
      } catch {
        // 缓存写失败不影响索引可用性（内存快照仍在）
      }
    },

    async clear(root) {
      try {
        await unlink(cacheFile(root))
      } catch {
        // 文件不存在视为已清理
      }
    },
  }
}
