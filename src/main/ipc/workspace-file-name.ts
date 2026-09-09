export const safeWorkspaceFileName = (name: unknown): string | null => {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (
    !trimmed ||
    trimmed === '.' ||
    trimmed === '..' ||
    /[\\/:*?"<>|]/.test(trimmed) ||
    /[. ]$/.test(trimmed) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(trimmed)
  ) {
    return null
  }
  return trimmed
}
