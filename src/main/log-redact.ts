/**
 * 主进程日志脱敏：去掉绝对路径片段，避免隐私说明与日志互相矛盾。
 * 不保证穷尽所有路径形态；用于 Error.message/stack 再输出。
 */

const WINDOWS_PATH = /(?:[A-Za-z]:\\|\\\\)[^\s"'<>|]+/g
const POSIX_ABS_PATH = /(?:^|[\s("'=])(\/(?:Users|home|tmp|var|etc|opt|private)\/[^\s"'<>]+)/g

export const redactPathsInText = (text: string): string => {
  let next = text.replace(WINDOWS_PATH, '<path>')
  next = next.replace(POSIX_ABS_PATH, (match, pathPart: string) =>
    match.replace(pathPart, '<path>'),
  )
  return next
}

export const formatErrorForLog = (error: unknown): string => {
  if (error instanceof Error) {
    const message = redactPathsInText(error.message)
    const stack = error.stack ? redactPathsInText(error.stack) : ''
    return stack || message
  }
  return redactPathsInText(String(error))
}
