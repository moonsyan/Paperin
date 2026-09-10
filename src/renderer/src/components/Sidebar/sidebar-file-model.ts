import type { OpenFile } from './types'

const normalizeComparablePath = (value: string): string => {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$|^\/+/, '')
  return normalized.toLowerCase()
}

export const isPathWithinRoot = (root: string, candidate: string): boolean => {
  const normalizedRoot = normalizeComparablePath(root)
  const normalizedCandidate = normalizeComparablePath(candidate)
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)
}

export const collectExternalOpenFiles = (
  files: OpenFile[],
  workspacePath: string | null,
): OpenFile[] => files.filter((file) => Boolean(file.path) && (!workspacePath || !isPathWithinRoot(workspacePath, file.path!)))
