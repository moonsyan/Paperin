import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { WorkspaceSettingsState } from '../../../shared/workspace-state'
import {
  mergeSourceSnapshotIntoSettings,
  sourceRegistrationTicketMatches,
  type SourceRegistrationTicket,
} from '../lib/remember-source-snapshot'
import { toWorkspaceRelativePath } from '../lib/workspace-state'

export interface UseSourceTrackingOptions {
  workspacePath: string | undefined
  setWorkspaceSettings: Dispatch<SetStateAction<WorkspaceSettingsState>>
}

export interface UseSourceTrackingReturn {
  /** 正文已成功插入后调用；异步 stat 受工作区 epoch 与记录版本约束。 */
  rememberSourceAfterInsert: (absolutePath: string) => void
  /** 清除来源记录等操作后调用，使挂起的 stat 回包失效。 */
  notifySourceRecordsCleared: () => void
}

export function useSourceTracking({
  workspacePath,
  setWorkspaceSettings,
}: UseSourceTrackingOptions): UseSourceTrackingReturn {
  const workspaceEpochRef = useRef(0)
  const recordVersionRef = useRef(0)

  useEffect(() => {
    workspaceEpochRef.current += 1
  }, [workspacePath])

  useEffect(
    () => () => {
      workspaceEpochRef.current += 1
    },
    [],
  )

  const readTicket = (): SourceRegistrationTicket => ({
    workspaceEpoch: workspaceEpochRef.current,
    recordVersion: recordVersionRef.current,
  })

  const notifySourceRecordsCleared = useCallback(() => {
    recordVersionRef.current += 1
  }, [])

  const rememberSourceAfterInsert = useCallback(
    (absolutePath: string) => {
      if (!workspacePath || !window.desktopAPI) return
      const ticket = readTicket()
      const relative = toWorkspaceRelativePath(
        workspacePath,
        absolutePath,
        window.desktopAPI.platform === 'win32',
      )
      if (!relative) return

      void window.desktopAPI.document
        .stat(absolutePath)
        .then((result) => {
          if (!sourceRegistrationTicketMatches(ticket, readTicket())) return
          const modifiedTime = result.ok ? result.data?.modifiedTime : undefined
          if (typeof modifiedTime !== 'number') return
          setWorkspaceSettings((current) =>
            mergeSourceSnapshotIntoSettings(current, relative, modifiedTime),
          )
        })
        .catch(() => {
          /* stat 失败静默跳过，不改正文、不抛未处理 rejection */
        })
    },
    [setWorkspaceSettings, workspacePath],
  )

  return { rememberSourceAfterInsert, notifySourceRecordsCleared }
}
