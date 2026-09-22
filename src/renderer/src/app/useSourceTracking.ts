import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DocumentSourceBaseline, WorkspaceSettingsState } from '../../../shared/workspace-state'
import {
  isEphemeralCitingDocumentKey,
  isPersistableCitingDocumentPath,
  rebindEphemeralCitingDocument,
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
  /** 未保存文档在内存中的来源基线。 */
  ephemeralBaselines: DocumentSourceBaseline[]
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
  activeDocumentId,
  setWorkspaceSettings,
}: UseSourceTrackingOptions): UseSourceTrackingReturn {
  const workspaceEpochRef = useRef(0)
  const recordVersionRef = useRef(0)
  const previousCitingKeyRef = useRef<string | null>(null)
  const [ephemeralBaselines, setEphemeralBaselines] = useState<DocumentSourceBaseline[]>([])

  useEffect(() => {
    workspaceEpochRef.current += 1
    setEphemeralBaselines([])
    previousCitingKeyRef.current = null
  }, [workspacePath])

  useEffect(
    () => () => {
      workspaceEpochRef.current += 1
    },
    [],
  )

  useEffect(() => {
    const previous = previousCitingKeyRef.current
    previousCitingKeyRef.current = citingDocumentKey
    if (
      !previous
      || !citingDocumentKey
      || !isEphemeralCitingDocumentKey(previous)
      || !isPersistableCitingDocumentPath(citingDocumentKey)
    ) {
      return
    }
    setEphemeralBaselines((current) => {
      const migrating = current.filter((item) => item.citingDocumentPath === previous)
      if (migrating.length > 0) {
        setWorkspaceSettings((settings) => ({
          ...settings,
          editor: {
            ...settings.editor,
            documentSourceBaselines: migrating.reduce(
              (baselines, item) => rememberDocumentSourceBaseline(baselines, {
                ...item,
                citingDocumentPath: citingDocumentKey,
              }),
              settings.editor.documentSourceBaselines,
            ),
          },
        }))
      }
      return current.filter((item) => item.citingDocumentPath !== previous)
    })
    setWorkspaceSettings((settings) => ({
      ...settings,
      editor: {
        ...settings.editor,
        documentSourceBaselines: rebindEphemeralCitingDocument(
          settings.editor.documentSourceBaselines,
          activeDocumentId,
          citingDocumentKey,
        ),
      },
    }))
  }, [activeDocumentId, citingDocumentKey, setWorkspaceSettings])

  const readTicket = (): SourceRegistrationTicket => ({
    workspaceEpoch: workspaceEpochRef.current,
    recordVersion: recordVersionRef.current,
  })

  const notifySourceRecordsCleared = useCallback(() => {
    recordVersionRef.current += 1
  }, [])

  const rememberSourceAfterInsert = useCallback(
    (absolutePath: string) => {
      if (!workspacePath || !window.desktopAPI || !citingDocumentKey) return
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
          const baseline = {
            citingDocumentPath: citingDocumentKey,
            sourcePath: relative,
            modifiedTime,
          }
          if (isPersistableCitingDocumentPath(citingDocumentKey)) {
            setWorkspaceSettings((current) =>
              mergeDocumentSourceBaselineIntoSettings(
                current,
                citingDocumentKey,
                relative,
                modifiedTime,
              ),
            )
            return
          }
          setEphemeralBaselines((current) => rememberDocumentSourceBaseline(current, baseline))
        })
        .catch(() => {
          /* stat 失败静默跳过，不改正文、不抛未处理 rejection */
        })
    },
    [citingDocumentKey, setWorkspaceSettings, workspacePath],
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

  return {
    rememberSourceAfterInsert,
    notifySourceRecordsCleared,
    ephemeralBaselines,
    readSourceRegistrationTicket: readTicket,
    applySourceRelocation,
  }
}

