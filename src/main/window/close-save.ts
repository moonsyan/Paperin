/**
 * 关窗保存等待的结果：
 * - saved：渲染进程明确返回 true（全部文档已落盘）
 * - incomplete：保存流程未完成（用户取消另存为对话框等）——窗口保持打开，无需打扰
 * - failed：渲染进程保存抛错——窗口保持打开，建议提示
 * - timedout：超过 timeoutMs 未完成——窗口保持打开，应明确提示用户
 */
export type CloseSaveOutcome = 'saved' | 'incomplete' | 'failed' | 'timedout'

export const waitForCloseSave = async (
  save: () => Promise<unknown>,
  timeoutMs: number,
): Promise<CloseSaveOutcome> => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    const result = await Promise.race([
      Promise.resolve().then(save),
      new Promise<CloseSaveOutcome>((resolve) => {
        timeout = setTimeout(() => resolve('timedout'), timeoutMs)
      }),
    ])
    if (result === true) return 'saved'
    if (result === 'timedout') return 'timedout'
    return 'incomplete'
  } catch {
    return 'failed'
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
