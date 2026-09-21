import type { Dispatch, SetStateAction } from 'react'
import {
  rememberSourceSnapshot,
  type WorkspaceSettingsState,
} from '../../../shared/workspace-state'
import { toWorkspaceRelativePath } from './workspace-state'

/** 插入引用成功后异步记下 mtime；失败静默跳过，不改正文。 */
export const rememberSourceSnapshotFromDisk = (
  absolutePath: string,
  workspacePath: string | undefined,
  setWorkspaceSettings: Dispatch<SetStateAction<WorkspaceSettingsState>>,
): void => {
  if (!workspacePath || !window.desktopAPI) return
  const relative = toWorkspaceRelativePath(
    workspacePath,
    absolutePath,
    window.desktopAPI.platform === 'win32',
  )
  if (!relative) return
  void window.desktopAPI.document.stat(absolutePath).then((result) => {
    const modifiedTime = result.ok ? result.data?.modifiedTime : undefined
    if (typeof modifiedTime !== 'number') return
    setWorkspaceSettings((current) => ({
      ...current,
      editor: {
        ...current.editor,
        sourceSnapshots: rememberSourceSnapshot(current.editor.sourceSnapshots, {
          path: relative,
          modifiedTime,
        }),
      },
    }))
  })
}

export const searchQueryForRelocate = (relativePath: string): string => {
  const slash = relativePath.replace(/\\/g, '/')
  return slash.split('/').pop()?.replace(/\.md$/i, '') || slash
}
