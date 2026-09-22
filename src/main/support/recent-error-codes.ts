const MAX_RECENT_ERROR_CODES = 20

const recentErrorCodes: string[] = []

/** 记录主进程返回给渲染层的错误码（不含 message/path）。 */
export const noteSupportErrorCode = (code: unknown): void => {
  if (typeof code !== 'string' || !code || !/^[A-Z0-9_]+$/.test(code)) return
  const index = recentErrorCodes.indexOf(code)
  if (index >= 0) recentErrorCodes.splice(index, 1)
  recentErrorCodes.unshift(code)
  if (recentErrorCodes.length > MAX_RECENT_ERROR_CODES) {
    recentErrorCodes.length = MAX_RECENT_ERROR_CODES
  }
}

export const getRecentSupportErrorCodes = (): readonly string[] => [...recentErrorCodes]

export const resetRecentSupportErrorCodesForTests = (): void => {
  recentErrorCodes.length = 0
}
