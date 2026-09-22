import type { WorkspaceSettingsState } from '../../../shared/workspace-state'
import { rememberSourceSnapshot } from '../../../shared/workspace-state'

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
export const mergeSourceSnapshotIntoSettings = (
  settings: WorkspaceSettingsState,
  relativePath: string,
  modifiedTime: number,
): WorkspaceSettingsState => ({
  ...settings,
  editor: {
    ...settings.editor,
    sourceSnapshots: rememberSourceSnapshot(settings.editor.sourceSnapshots, {
      path: relativePath,
      modifiedTime,
    }),
  },
})

export const searchQueryForRelocate = (relativePath: string): string => {
  const slash = relativePath.replace(/\\/g, '/')
  return slash.split('/').pop()?.replace(/\.md$/i, '') || slash
}
