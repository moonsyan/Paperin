export const resolveRestoredActiveFileId = (
  sessionActiveFileId: string | undefined,
  availableFileIds: ReadonlySet<string>,
  fallbackFileId: string,
): string => {
  if (sessionActiveFileId && availableFileIds.has(sessionActiveFileId)) {
    return sessionActiveFileId
  }

  return fallbackFileId
}
