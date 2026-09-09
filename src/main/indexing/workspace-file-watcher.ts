/**
 * 工作区文件监听（Track C / Task 9）。
 *
 * 仅监听当前工作区根目录：过滤隐藏目录、node_modules 与非 Markdown 文件，
 * 变更去抖合并后回调（触发索引 refresh）。文件是否存在不在此判定——
 * 删除事件同样转发，缺失由索引服务扫描确认。工作区关闭/切换时取消。
 */

import { watch as fsWatch } from 'fs'

export interface WorkspaceFileWatcherDeps {
  /** 底层 watch 封装：返回取消监听的函数（单测注入假实现） */
  watch(root: string, onChange: (paths: string[]) => void): () => void
  debounceMs?: number
}

const isMarkdownPath = (path: string): boolean => /\.(md|markdown)$/i.test(path)

const isFilteredPath = (path: string): boolean => {
  const segments = path.split(/[\\/]/)
  for (const segment of segments.slice(1, -1)) {
    if (segment.startsWith('.') || segment === 'node_modules') return true
  }
  return false
}

export interface WorkspaceFileWatcher {
  start(root: string, onChange: (paths: string[]) => void): void
  stop(): void
}

export const createWorkspaceFileWatcher = (
  deps: WorkspaceFileWatcherDeps,
): WorkspaceFileWatcher => {
  const debounceMs = deps.debounceMs ?? 250
  let stopCurrent: (() => void) | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: string[] = []

  const flush = (): void => {
    timer = null
    const paths = pending
    pending = []
    if (paths.length === 0) return
    onChangeRef.current?.(paths)
  }

  // 经 ref 转发最新回调：start 切换工作区后旧 timer 不会打到旧回调
  const onChangeRef: { current: ((paths: string[]) => void) | null } = { current: null }

  const handleChange = (paths: string[]): void => {
    const markdown = paths.filter((p) => isMarkdownPath(p) && !isFilteredPath(p))
    if (markdown.length === 0) return
    pending.push(...markdown)
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }

  return {
    start(root, onChange) {
      this.stop()
      onChangeRef.current = onChange
      stopCurrent = deps.watch(root, handleChange)
    },

    stop() {
      stopCurrent?.()
      stopCurrent = null
      onChangeRef.current = null
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pending = []
    },
  }
}

/** 默认 fs.watch 封装：recursive 监听根目录，事件名不影响（增删改都触发刷新） */
export const createFsWatchAdapter = (): WorkspaceFileWatcherDeps['watch'] => {
  return (root, onChange) => {
    let watcher: ReturnType<typeof fsWatch> | null = null
    try {
      watcher = fsWatch(root, { recursive: true }, (_event, fileName) => {
        // fileName 为相对路径或 null（平台差异）；null 时交由服务全量比对
        const path = typeof fileName === 'string' && fileName ? `${root}\\${fileName}` : root
        onChange([path])
      })
    } catch {
      // 目录消失等场景：返回空操作，索引 refresh 由外部周期或用户操作兜底
      return () => undefined
    }
    return () => {
      watcher?.close()
      watcher = null
    }
  }
}
