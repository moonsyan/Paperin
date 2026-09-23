import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DocumentSourceBaseline, WorkspaceSettingsState } from '../../../shared/workspace-state'
import {
  isEphemeralCitingDocumentKey,
  isPersistableCitingDocumentPath,
  rememberDocumentSourceBaseline,
  relocateCitingDocumentSourceBaseline,
} from '../../../shared/workspace-state'
import {
  mergeDocumentSourceBaselineIntoSettings,
  sourceRegistrationTicketMatches,
  type SourceRegistrationTicket,
} from '../lib/remember-source-snapshot'
import type { SourceRelocationBinding, SourceRelocationChoice } from '../lib/source-relocation'
import {
  applySourceRelocationToSettings,
  sourceRelocationBindingMatches,
} from '../lib/source-relocation'
import { toWorkspaceRelativePath } from '../lib/workspace-state'
import { remapSourceTrackingPath } from '../../../shared/source-tracking'

export interface UseSourceTrackingOptions {
  workspacePath: string | undefined
  citingDocumentKey: string | null
  activeDocumentId: string
  setWorkspaceSettings: Dispatch<SetStateAction<WorkspaceSettingsState>>
}

export interface UseSourceTrackingReturn {
  /** 正文已成功插入后调用；异步 stat 受工作区 epoch 与记录版本约束。 */
  rememberSourceAfterInsert: (absolutePath: string) => void
  /** 清除来源记录等操作后调用，使挂起的 stat 回包失效。 */
  notifySourceRecordsCleared: () => void
  /**
   * 首次保存/另存为到库内相对路径时显式登记身份迁移。
   * 禁止用「临时→持久」切标签猜测（A02）；晚到的 stat 经此映射归属（A03）。
   */
  commitCitingIdentityMigration: (fromEphemeralKey: string, toRelativePath: string) => void
  /** 未保存文档在内存中的来源基线。 */
  ephemeralBaselines: DocumentSourceBaseline[]
  /** 库内路径 rename/move 后同步 remap 内存基线中的来源路径。 */
  remapEphemeralSourcePaths: (
    oldRelativePath: string,
    newRelativePath: string,
    caseInsensitive: boolean,
  ) => void
  readSourceRegistrationTicket: () => SourceRegistrationTicket
  applySourceRelocation: (
    binding: SourceRelocationBinding,
    choice: SourceRelocationChoice,
    caseInsensitive: boolean,
  ) => boolean
}

export function useSourceTracking({
  workspacePath,
  citingDocumentKey,
  activeDocumentId: _activeDocumentId,
  setWorkspaceSettings,
}: UseSourceTrackingOptions): UseSourceTrackingReturn {
  const workspaceEpochRef = useRef(0)
  const recordVersionRef = useRef(0)
  const identityMigrationsRef = useRef(new Map<string, string>())
  const [ephemeralBaselines, setEphemeralBaselines] = useState<DocumentSourceBaseline[]>([])

  useEffect(() => {
    workspaceEpochRef.current += 1
    setEphemeralBaselines([])
    identityMigrationsRef.current = new Map()
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

  const resolveCitingKeyForCallback = useCallback((insertKey: string): string => {
    return identityMigrationsRef.current.get(insertKey) ?? insertKey
  }, [])

  const commitCitingIdentityMigration = useCallback(
    (fromEphemeralKey: string, toRelativePath: string) => {
      if (
        !isEphemeralCitingDocumentKey(fromEphemeralKey)
        || !isPersistableCitingDocumentPath(toRelativePath)
      ) {
        return
      }
      identityMigrationsRef.current.set(fromEphemeralKey, toRelativePath)
      setEphemeralBaselines((current) => {
        const migrating = current.filter((item) => item.citingDocumentPath === fromEphemeralKey)
        if (migrating.length > 0) {
          setWorkspaceSettings((settings) => ({
            ...settings,
            editor: {
              ...settings.editor,
              documentSourceBaselines: migrating.reduce(
                (baselines, item) =>
                  rememberDocumentSourceBaseline(baselines, {
                    ...item,
                    citingDocumentPath: toRelativePath,
                  }),
                settings.editor.documentSourceBaselines,
              ),
            },
          }))
        }
        return current.filter((item) => item.citingDocumentPath !== fromEphemeralKey)
      })
    },
    [setWorkspaceSettings],
  )

  const rememberSourceAfterInsert = useCallback(
    (absolutePath: string) => {
      if (!workspacePath || !window.desktopAPI || !citingDocumentKey) return
      const ticket = readTicket()
      const insertKey = citingDocumentKey
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
          const targetKey = resolveCitingKeyForCallback(insertKey)
          if (isPersistableCitingDocumentPath(targetKey)) {
            setWorkspaceSettings((current) =>
              mergeDocumentSourceBaselineIntoSettings(
                current,
                targetKey,
                relative,
                modifiedTime,
              ),
            )
            // 晚回包已落到持久路径：清理身份映射，避免长会话只增不减
            if (targetKey !== insertKey) {
              identityMigrationsRef.current.delete(insertKey)
            }
            return
          }
          setEphemeralBaselines((current) =>
            rememberDocumentSourceBaseline(current, {
              citingDocumentPath: targetKey,
              sourcePath: relative,
              modifiedTime,
            }),
          )
        })
        .catch(() => {
          /* stat 失败静默跳过，不改正文、不抛未处理 rejection */
        })
    },
    [citingDocumentKey, resolveCitingKeyForCallback, setWorkspaceSettings, workspacePath],
  )

  const applySourceRelocation = useCallback(
    (
      binding: SourceRelocationBinding,
      choice: SourceRelocationChoice,
      caseInsensitive: boolean,
    ): boolean => {
      const currentBinding: SourceRelocationBinding = {
        citingDocumentKey: citingDocumentKey ?? '',
        ticket: readTicket(),
      }
      if (!citingDocumentKey || !sourceRelocationBindingMatches(binding, currentBinding)) {
        return false
      }
      if (isPersistableCitingDocumentPath(citingDocumentKey)) {
        setWorkspaceSettings((current) => {
          const next = applySourceRelocationToSettings(
            current,
            binding,
            currentBinding,
            choice,
            caseInsensitive,
          )
          if (!next) return current
          return next
        })
        return true
      }
      setEphemeralBaselines((current) =>
        relocateCitingDocumentSourceBaseline(
          current,
          citingDocumentKey,
          choice.previousPath,
          choice.selectedPath,
          choice.selectedModifiedTime,
          caseInsensitive,
        ),
      )
      return true
    },
    [citingDocumentKey, setWorkspaceSettings],
  )

  const remapEphemeralSourcePaths = useCallback(
    (oldRelativePath: string, newRelativePath: string, caseInsensitive: boolean) => {
      setEphemeralBaselines((current) => {
        if (current.length === 0) return current
        return remapSourceTrackingPath(
          { documentSourceBaselines: current, legacySourceSnapshots: [] },
          oldRelativePath,
          newRelativePath,
          caseInsensitive,
        ).documentSourceBaselines
      })
    },
    [],
  )

  return {
    rememberSourceAfterInsert,
    notifySourceRecordsCleared,
    commitCitingIdentityMigration,
    ephemeralBaselines,
    remapEphemeralSourcePaths,
    readSourceRegistrationTicket: readTicket,
    applySourceRelocation,
  }
}
