import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { WorkspaceSettingsState } from '../../../shared/workspace-state'
import { remapSourceTrackingPath } from '../../../shared/source-tracking'
import { toWorkspaceRelativePath } from '../lib/workspace-state'

/**
 * 工作区文件 rename/move 成功后，同步持久化与内存中的来源基线路径。
 */
export function useWorkspaceSourcePathRemap(input: {
  workspacePath: string | undefined
  setWorkspaceSettings: Dispatch<SetStateAction<WorkspaceSettingsState>>
  remapEphemeralSourcePaths: (
    oldRelativePath: string,
    newRelativePath: string,
    caseInsensitive: boolean,
  ) => void
}): (oldAbsolutePath: string, newAbsolutePath: string) => void {
  const { workspacePath, setWorkspaceSettings, remapEphemeralSourcePaths } = input

  return useCallback(
    (oldAbsolutePath: string, newAbsolutePath: string) => {
      const root = workspacePath
      if (!root) return
      const caseInsensitive = window.desktopAPI?.platform === 'win32'
      const oldRelative = toWorkspaceRelativePath(root, oldAbsolutePath, caseInsensitive)
      const newRelative = toWorkspaceRelativePath(root, newAbsolutePath, caseInsensitive)
      if (!oldRelative || !newRelative || oldRelative === newRelative) return
      remapEphemeralSourcePaths(oldRelative, newRelative, caseInsensitive)
      setWorkspaceSettings((current) => {
        const remapped = remapSourceTrackingPath(
          {
            documentSourceBaselines: current.editor.documentSourceBaselines,
            legacySourceSnapshots: current.editor.legacySourceSnapshots,
          },
          oldRelative,
          newRelative,
          caseInsensitive,
        )
        return {
          ...current,
          editor: {
            ...current.editor,
            documentSourceBaselines: remapped.documentSourceBaselines,
            legacySourceSnapshots: remapped.legacySourceSnapshots,
          },
        }
      })
    },
    [remapEphemeralSourcePaths, setWorkspaceSettings, workspacePath],
  )
}
