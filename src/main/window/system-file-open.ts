import { posix, win32 } from 'path'

export type SystemOpenDisposition = 'reuse-window' | 'restore-window' | 'fresh-window'

const MAX_SYSTEM_OPEN_FILES = 20
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

/**
 * Accept one path delivered by an OS file association.
 *
 * The platform-specific path implementation is intentional: startup arguments
 * are parsed before any renderer exists and tests must be able to cover Windows
 * drive paths on every CI host. Relative paths, URLs and unsupported extensions
 * never cross the trusted-file boundary.
 */
export const normalizeSystemOpenFile = (
  candidate: string,
  platform: NodeJS.Platform,
): string | null => {
  const pathApi = platform === 'win32' ? win32 : posix
  const trimmed = candidate.trim().replace(/^"(.*)"$/, '$1')
  if (!trimmed || trimmed.startsWith('-') || !pathApi.isAbsolute(trimmed)) return null
  if (!MARKDOWN_EXTENSIONS.has(pathApi.extname(trimmed).toLowerCase())) return null
  return pathApi.normalize(trimmed)
}

/** Extract and deduplicate Markdown paths from launch or second-instance argv. */
export const collectSystemOpenFiles = (
  argv: readonly string[],
  platform: NodeJS.Platform,
): string[] => {
  const seen = new Set<string>()
  const files: string[] = []
  for (const arg of argv) {
    const path = normalizeSystemOpenFile(arg, platform)
    if (!path) continue
    const key = platform === 'win32' ? path.toLocaleLowerCase('en-US') : path
    if (seen.has(key)) continue
    seen.add(key)
    files.push(path)
    if (files.length === MAX_SYSTEM_OPEN_FILES) break
  }
  return files
}

/**
 * Single-window mode restores the normal workspace and reuses it when present.
 * Multi-window mode isolates an association open in a fresh window so separate
 * renderer sessions cannot overwrite the shared persisted session.
 */
export const chooseSystemOpenDisposition = (
  multiWindow: boolean,
  hasWindow: boolean,
): SystemOpenDisposition => {
  if (multiWindow) return 'fresh-window'
  return hasWindow ? 'reuse-window' : 'restore-window'
}
