/**
 * 工作区文件监听（Track C / Task 9，R06 目录失效）。
 *
 * 仅监听当前工作区根目录：过滤 hidden 目录与 node_modules；Markdown 与附件变更去抖合并后回调。
 * 变更去抖合并后回调；根路径/目录级/无名事件触发 rescan，不能用伪造 .md 路径冒充。
 * 工作区关闭/切换时取消 timer 与底层 watch。
 */

import { watch as fsWatch } from 'fs'
import { join } from 'path'

export type WorkspaceChange =
  | { kind: 'changes'; markdownPaths: string[]; resourcePaths: string[] }
  | { kind: 'rescan'; reason: 'directory' | 'unknown' }

export interface WorkspaceFileWatcherDeps {
  /** 底层 watch：相对或绝对路径批次；空字符串表示平台未提供文件名 */
  watch(root: string, onRawChange: (paths: string[]) => void): () => void
  debounceMs?: number
  /** 单批次待合并 Markdown 路径上限，超出则降级为 rescan（防监听风暴） */
  maxPendingFilePaths?: number
}

const DEFAULT_MAX_PENDING_FILE_PATHS = 20_000

const isMarkdownPath = (path: string): boolean => /\.(md|markdown)$/i.test(path)

const isFilteredPath = (path: string): boolean => {
  const segments = path.split(/[\\/]/)
  for (const segment of segments.slice(1, -1)) {
    if (segment.startsWith('.') || segment === 'node_modules') return true
  }
  return false
}

const normalizeComparable = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

type PathKind = 'ignore' | 'markdown' | 'resource' | 'rescan-directory' | 'rescan-unknown'

const looksLikeFilePath = (path: string): boolean => {
  const name = path.split(/[\\/]/).pop() ?? path
  return /\.[^./\\]+$/.test(name)
}

const classifyRawPath = (root: string, raw: string): PathKind => {
  if (!raw.trim()) return 'rescan-unknown'
  const normRoot = normalizeComparable(root)
  const normPath = normalizeComparable(raw)
  if (normPath === normRoot) return 'rescan-directory'
  if (isFilteredPath(raw)) return 'ignore'
  if (isMarkdownPath(raw)) return 'markdown'
  // 非 Markdown 但带扩展名：附件/资源变化，合并后触发依赖重验（不整库重扫正文）
  if (looksLikeFilePath(raw)) return 'resource'
  if (normPath.startsWith(`${normRoot}/`)) return 'rescan-directory'
  return 'rescan-unknown'
}

export interface WorkspaceFileWatcher {
  start(root: string, onChange: (change: WorkspaceChange) => void): void
  stop(): void
}

export const createWorkspaceFileWatcher = (
  deps: WorkspaceFileWatcherDeps,
): WorkspaceFileWatcher => {
  const debounceMs = deps.debounceMs ?? 250
  const maxPendingFilePaths = deps.maxPendingFilePaths ?? DEFAULT_MAX_PENDING_FILE_PATHS
  let stopCurrent: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingMarkdown = new Set<string>()
  let pendingResources = new Set<string>()
  let pendingRescan: 'directory' | 'unknown' | null = null
  let watchRoot = ''

  const onChangeRef: { current: ((change: WorkspaceChange) => void) | null } = { current: null }

  const flush = (): void => {
    timer = null
    if (pendingRescan) {
      const reason = pendingRescan
      pendingRescan = null
      pendingMarkdown = new Set<string>()
      pendingResources = new Set<string>()
      onChangeRef.current?.({ kind: 'rescan', reason })
      return
    }
    const markdownPaths = Array.from(pendingMarkdown)
    const resourcePaths = Array.from(pendingResources)
    pendingMarkdown = new Set<string>()
    pendingResources = new Set<string>()
    if (markdownPaths.length === 0 && resourcePaths.length === 0) return
    onChangeRef.current?.({ kind: 'changes', markdownPaths, resourcePaths })
  }

  const scheduleRescan = (reason: 'directory' | 'unknown'): void => {
    pendingRescan = pendingRescan === 'unknown' || reason === 'unknown' ? 'unknown' : reason
    pendingMarkdown.clear()
    pendingResources.clear()
  }

  const handleRawChange = (paths: string[]): void => {
    for (const raw of paths) {
      const kind = classifyRawPath(watchRoot, raw)
      if (kind === 'ignore') continue
      if (kind === 'markdown') {
        if (pendingRescan) continue
        pendingMarkdown.add(raw)
        if (pendingMarkdown.size > maxPendingFilePaths) {
          scheduleRescan('unknown')
        }
        continue
      }
      if (kind === 'resource') {
        if (pendingRescan) continue
        pendingResources.add(raw)
        if (pendingResources.size > maxPendingFilePaths) {
          scheduleRescan('unknown')
        }
        continue
      }
      scheduleRescan(kind === 'rescan-unknown' ? 'unknown' : 'directory')
    }
    if (!pendingRescan && pendingMarkdown.size === 0 && pendingResources.size === 0) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }

  return {
    start(root, onChange) {
      this.stop()
      watchRoot = root
      onChangeRef.current = onChange
      stopCurrent = deps.watch(root, handleRawChange)
    },

    stop() {
      stopCurrent?.()
      stopCurrent = null
      watchRoot = ''
      onChangeRef.current = null
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pendingMarkdown = new Set<string>()
      pendingResources = new Set<string>()
      pendingRescan = null
    },
  }
}

/** 默认 fs.watch 封装：recursive 监听根目录，无名事件触发 rescan unknown */
export const createFsWatchAdapter = (): WorkspaceFileWatcherDeps['watch'] => {
  return (root, onRawChange) => {
    let watcher: ReturnType<typeof fsWatch> | null = null
    try {
      watcher = fsWatch(root, { recursive: true }, (_event, fileName) => {
        if (fileName == null || fileName === '') {
          onRawChange([''])
          return
        }
        onRawChange([join(root, fileName)])
      })
    } catch {
      return () => undefined
    }
    return () => {
      watcher?.close()
      watcher = null
    }
  }
}
