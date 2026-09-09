type SaveSnapshot<TSnapshot> = (id: string, snapshot: TSnapshot) => Promise<void>

const BASE_RETRY_DELAY = 1000
const MAX_RETRY_DELAY = 30000

/**
 * 不可自愈的保存失败（如 ENCODING_LOSS：内容含当前编码无法表示的字符）。
 * 重试永远得到同样结果，只会无限弹提示；抛出后队列不再自动重试，
 * 等用户手动保存（Ctrl+S）走交互式降级处理。
 */
export class NonRetryableSaveError extends Error {
  constructor(message?: string) {
    super(message)
    this.name = 'NonRetryableSaveError'
  }
}

const isNonRetryable = (err: unknown): boolean => err instanceof NonRetryableSaveError

export class DocumentSaveQueue<TSnapshot> {
  private readonly pending = new Map<string, TSnapshot>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly running = new Map<string, Promise<void>>()
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly retryAttempts = new Map<string, number>()
  // 3.2：已取消的 id。磁盘写入本身不可中断，但失败快照不会回填、也不再重试。
  private readonly canceled = new Map<string, number>()
  private nextCancelToken = 0

  constructor(
    private readonly saveSnapshot: SaveSnapshot<TSnapshot>,
    private readonly debounceMs: number,
  ) {}

  schedule(id: string, snapshot: TSnapshot): void {
    // 重新排程即视为复活：清除取消标记与待重试计时器
    this.canceled.delete(id)
    this.clearRetryTimer(id)
    this.pending.set(id, snapshot)
    this.clearTimer(id)
    this.timers.set(id, setTimeout(() => {
      this.timers.delete(id)
      void this.flush(id).catch(() => undefined)
    }, this.debounceMs))
  }

  async flush(id: string): Promise<void> {
    this.clearTimer(id)
    this.clearRetryTimer(id)
    while (this.pending.has(id) || this.running.has(id)) {
      // 被取消的 id：等待在途保存结束，但不回填失败快照、不安排重试。
      // 不清除 canceled——显式 flush（用户 Ctrl+S / 退出前落账）也受 cancel 约束：
      // cancel 由 handleCloseTab/removeClosedTabs 调用，此时标签即将关闭，
      // flushAll 前已取消的文件不应再写回磁盘
      const cancelToken = this.canceled.get(id)
      if (cancelToken !== undefined) {
        const current = this.running.get(id)
        try {
          if (current) await current
        } catch {
          // 原始 flush 仍向调用方传播错误；取消后的等待者只负责收尾
        } finally {
          // 等待期间可能已重新 schedule；旧取消只能清理自己的代次，不能删新快照
          if (this.canceled.get(id) === cancelToken) {
            this.pending.delete(id)
            this.canceled.delete(id)
          }
        }
        return
      }
      const current = this.running.get(id)
      if (current) {
        await current
        continue
      }

      const snapshot = this.pending.get(id)
      if (snapshot === undefined) return
      this.pending.delete(id)
      const task = this.saveSnapshot(id, snapshot)
      this.running.set(id, task)
      try {
        await task
        // 保存成功：重置该 id 的退避重试计数
        this.retryAttempts.delete(id)
      } catch (err) {
        // 3.2：保存失败自动退避重试，而不是等下一次编辑才重试（避免静默丢未保存内容）。
        // 若重试前用户又编辑，pending 已有更新快照，优先用新内容覆盖旧失败快照。
        // 已取消的 id 不回填、不重试，避免把用户已撤销的旧脏内容复活到磁盘；
        // 不可自愈的错误（NonRetryableSaveError）重试只会无限弹提示，同样跳过
        if (!this.canceled.has(id) && !isNonRetryable(err)) {
          if (!this.pending.has(id)) {
            this.pending.set(id, snapshot)
          }
          this.scheduleRetry(id)
        }
        throw err
      } finally {
        if (this.running.get(id) === task) this.running.delete(id)
      }
    }
  }

  async flushAll(): Promise<void> {
    const ids = Array.from(new Set([
      ...Array.from(this.pending.keys()),
      ...Array.from(this.running.keys()),
    ]))
    // 单个 id 失败不跳过其余 id（关窗时全部落盘机会均等），
    // 结束后重抛首个错误保持"失败→窗口保持打开"的安全语义
    let firstError: unknown = null
    let failed = false
    for (const id of ids) {
      try {
        await this.flush(id)
      } catch (err) {
        if (!failed) {
          firstError = err
          failed = true
        }
      }
    }
    if (failed) throw firstError
  }

  cancel(id: string, replacement?: TSnapshot): void {
    this.clearTimer(id)
    this.clearRetryTimer(id)
    this.pending.delete(id)
    if (replacement !== undefined) {
      // 取消在途写入但仍需落盘当前（最新）快照：排队 replacement，待在途写入完成后
      // 由 flush 回写。避免标签关闭前的内容丢失，也不会把旧脏内容复活到磁盘。
      this.canceled.delete(id)
      this.pending.set(id, replacement)
      return
    }
    // 无 replacement（内容已干净或无需落盘）：标记取消，在途写入不可中断，
    // 但其失败快照不会回填、不再重试。
    this.canceled.set(id, ++this.nextCancelToken)
  }

  private scheduleRetry(id: string): void {
    if (this.canceled.has(id)) return
    const attempt = (this.retryAttempts.get(id) ?? 0) + 1
    this.retryAttempts.set(id, attempt)
    const delay = Math.min(BASE_RETRY_DELAY * 2 ** (attempt - 1), MAX_RETRY_DELAY)
    this.clearRetryTimer(id)
    this.retryTimers.set(id, setTimeout(() => {
      this.retryTimers.delete(id)
      if (this.canceled.has(id)) return
      void this.flush(id).catch(() => undefined)
    }, delay))
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id)
    if (!timer) return
    clearTimeout(timer)
    this.timers.delete(id)
  }

  private clearRetryTimer(id: string): void {
    const timer = this.retryTimers.get(id)
    if (!timer) return
    clearTimeout(timer)
    this.retryTimers.delete(id)
  }
}
