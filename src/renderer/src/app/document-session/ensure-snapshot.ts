/**
 * 可等待的编辑快照契约（M1/T05）。
 *
 * 版本语义（renderer 内存中，不新建第二真相源）：
 * - `editorRevision` —— 编辑器 docChanged 事务计数，由 dirty-track 插件同步置位
 *   的 `dirtyRef`（`EditorHandle.hasPendingChanges()`）承载「防抖窗口内有输入
 *   尚未落账」这一事实；
 * - `snapshotRevision` —— markdownUpdated 防抖落账后的 `contentsRef` 快照，
 *   落账回调链同步执行，回调携带的必然是当前文档内容；
 * - `persistedRevision` —— 磁盘确认的版本，由保存成功后的
 *   `INITIAL_OR_SAVED` + mtime 回填表达。
 *
 * 核心不变量：保存请求必须先确保获得**含末次输入**的目标版本快照，再入队写盘；
 * 等待必须有进度与失败出口——超时后仍提交已落账的快照（保证磁盘有内容），
 * 但不宣称该版本包含末次输入，由调用方保留 dirty 让用户再次保存。
 */

/** 快照落账等待上限：防抖 200ms + 大文档序列化时间；超时走失败出口而不是无限等 */
export const SNAPSHOT_SETTLE_TIMEOUT_MS = 5_000

/** 落账轮询间隔：防抖窗口 200ms 内能探测到多次 */
export const SNAPSHOT_SETTLE_POLL_MS = 50

export interface EnsureSnapshotDeps {
  /** 编辑器是否还有未落账的输入（dirtyRef 非破坏读取） */
  hasPendingChanges: () => boolean
  /** 读取当前快照（大文档为 contentsRef 缓存口径） */
  readSnapshot: () => string
  /** 可注入的延时（测试用）；默认 setTimeout */
  delay?: (ms: number) => Promise<void>
}

export interface SnapshotOutcome {
  content: string
  /**
   * true —— 快照确认包含末次输入（或编辑器从未有未落账输入）；
   * false —— 等待超时，快照可能落后于编辑器，调用方必须保留 dirty 并提示
   */
  settled: boolean
}

const defaultDelay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 确保返回的快照包含编辑器的末次输入。
 *
 * 编辑器没有未落账输入时立即返回缓存（零等待，普通路径零开销）；
 * 有未落账输入时轮询等待落账（防抖 + 序列化完成），超时后仍返回当前缓存
 * 并以 `settled: false` 表明本次保存不包含末次输入。
 */
export const ensureFreshSnapshot = async (
  deps: EnsureSnapshotDeps,
  timeoutMs: number = SNAPSHOT_SETTLE_TIMEOUT_MS,
  pollMs: number = SNAPSHOT_SETTLE_POLL_MS,
): Promise<SnapshotOutcome> => {
  const wait = deps.delay ?? defaultDelay
  if (!deps.hasPendingChanges()) {
    return { content: deps.readSnapshot(), settled: true }
  }
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await wait(pollMs)
    if (!deps.hasPendingChanges()) {
      return { content: deps.readSnapshot(), settled: true }
    }
  }
  return { content: deps.readSnapshot(), settled: false }
}
