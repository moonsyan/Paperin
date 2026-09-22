import { ephemeralCitingDocumentKey } from '../../../shared/workspace-state'
import { toWorkspaceRelativePath } from './workspace-state'

/** 引用文档身份：库内相对路径，或未保存标签的 ephemeral 键。 */
export const resolveCitingDocumentKey = (
  documentId: string,
  absolutePath: string | undefined,
  workspacePath: string | undefined,
  caseInsensitive: boolean,
): string | null => {
  if (!workspacePath) return null
  if (absolutePath) {
    const relative = toWorkspaceRelativePath(workspacePath, absolutePath, caseInsensitive)
    if (relative) return relative
  }
  return ephemeralCitingDocumentKey(documentId)
}
