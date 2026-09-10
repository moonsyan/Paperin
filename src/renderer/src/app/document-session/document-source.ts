export type DocumentSource = 'workspace' | 'external'

const normalize = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/+$/g, '')

/** Classify a tab without consulting or mutating the workspace index. */
export const classifyDocumentSource = (
  filePath: string | undefined,
  workspacePath: string | null | undefined,
  caseInsensitive: boolean,
): DocumentSource => {
  // Untitled/demo documents remain part of the current workspace experience.
  if (!filePath) return 'workspace'
  if (!workspacePath) return 'external'
  const normalizedFile = normalize(filePath)
  const normalizedRoot = normalize(workspacePath)
  const comparableFile = caseInsensitive ? normalizedFile.toLocaleLowerCase('en-US') : normalizedFile
  const comparableRoot = caseInsensitive ? normalizedRoot.toLocaleLowerCase('en-US') : normalizedRoot
  return comparableFile === comparableRoot || comparableFile.startsWith(`${comparableRoot}/`)
    ? 'workspace'
    : 'external'
}
