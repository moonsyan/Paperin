import type { WorkspaceSettingsState } from '../../../shared/workspace-state'
import { rememberDocumentSourceBaseline } from '../../../shared/workspace-state'

/** 异步登记提交时必须与当前一致的工作区生命周期票据。 */
export interface SourceRegistrationTicket {
  workspaceEpoch: number
  recordVersion: number
}

export const sourceRegistrationTicketMatches = (
  captured: SourceRegistrationTicket,
  current: SourceRegistrationTicket,
): boolean =>
  captured.workspaceEpoch === current.workspaceEpoch &&
  captured.recordVersion === current.recordVersion

/** 将 stat 结果合并进工作区设置（纯函数，不含 I/O）。 */
export const mergeDocumentSourceBaselineIntoSettings = (
  settings: WorkspaceSettingsState,
  citingDocumentPath: string,
  sourceRelativePath: string,
  modifiedTime: number,
): WorkspaceSettingsState => ({
  ...settings,
  editor: {
    ...settings.editor,
    documentSourceBaselines: rememberDocumentSourceBaseline(
      settings.editor.documentSourceBaselines,
      { citingDocumentPath, sourcePath: sourceRelativePath, modifiedTime },
    ),
  },
})

export const searchQueryForRelocate = (relativePath: string): string => {
  const slash = relativePath.replace(/\\/g, '/')
  return slash.split('/').pop()?.replace(/\.md$/i, '') || slash
}
