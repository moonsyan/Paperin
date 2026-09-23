import path from 'node:path'

const WIN_ABS_RE = /^[a-zA-Z]:[\\/]|^\\\\/

/** Windows 盘符 / UNC 绝对路径（在 Linux 宿主上 path.isAbsolute 会判成相对） */
export const isWindowsStyleAbsolute = (value: string): boolean => WIN_ABS_RE.test(value)

const pickImpl = (...segments: string[]) =>
  segments.some((segment) => isWindowsStyleAbsolute(segment)) ? path.win32 : path

const normalizeWinResult = (resolved: string, usedWin32: boolean): string => {
  // 仅在非 Windows 宿主上把盘符路径收成正斜杠，避免 Linux CI 字符串比对失败；
  // 真实 win32 仍返回系统原生分隔符，供 fs.stat / path.join 使用。
  if (usedWin32 && process.platform !== 'win32') return resolved.replace(/\\/g, '/')
  return resolved
}

/**
 * 解析工作区内路径：含 Windows 风格绝对段时固定走 path.win32，
 * 避免 Ubuntu CI 把 `D:/notes` 拼进 cwd 导致资源解析失败。
 */
export const resolveWorkspacePath = (...segments: string[]): string => {
  const impl = pickImpl(...segments)
  return normalizeWinResult(impl.resolve(...segments), impl === path.win32)
}

export const dirnameWorkspacePath = (value: string): string => {
  const impl = pickImpl(value)
  return normalizeWinResult(impl.dirname(value), impl === path.win32)
}

export const relativeWorkspacePath = (from: string, to: string): string =>
  pickImpl(from, to).relative(from, to)

export const isAbsoluteWorkspacePath = (value: string): boolean =>
  isWindowsStyleAbsolute(value) || path.isAbsolute(value)
