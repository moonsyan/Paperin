import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { SupportSummaryV1 } from '../../../shared/support-summary'
import type { DiagnosticRecord, WorkspaceIndex } from '../../../shared/workspace-index'
import { buildSupportSummaryFromWorkspace } from '../lib/support-summary'

export function useSupportSummaryDialog(
  workspaceIndex: WorkspaceIndex | null,
  diagnostics: readonly DiagnosticRecord[],
): {
  supportSummaryOpen: boolean
  setSupportSummaryOpen: Dispatch<SetStateAction<boolean>>
  supportSummary: SupportSummaryV1 | null
  supportSummaryLoading: boolean
  supportSummaryError: string | null
  handleSaveSupportSummary: (json: string) => Promise<{ ok: boolean; error?: { code: string } }>
  handleExportTempSupportSummary: (json: string) => Promise<{
    ok: boolean
    data?: { fileName: string }
    error?: { code: string }
  }>
  handleCopySupportSummary: (json: string) => void
} {
  const [supportSummaryOpen, setSupportSummaryOpen] = useState(false)
  const [supportSummary, setSupportSummary] = useState<SupportSummaryV1 | null>(null)
  const [supportSummaryLoading, setSupportSummaryLoading] = useState(false)
  const [supportSummaryError, setSupportSummaryError] = useState<string | null>(null)

  useEffect(() => {
    if (!supportSummaryOpen) return
    let cancelled = false
    void (async () => {
      setSupportSummaryLoading(true)
      setSupportSummaryError(null)
      const env = await window.desktopAPI.support.getEnvironment()
      if (cancelled) return
      if (!env.ok || !env.data) {
        setSupportSummary(null)
        setSupportSummaryError('无法读取运行环境信息。')
        setSupportSummaryLoading(false)
        return
      }
      setSupportSummary(buildSupportSummaryFromWorkspace(env.data, workspaceIndex, diagnostics))
      setSupportSummaryLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supportSummaryOpen, workspaceIndex, diagnostics])

  const handleSaveSupportSummary = useCallback(
    (json: string) => window.desktopAPI.support.saveSummary(json),
    [],
  )

  const handleExportTempSupportSummary = useCallback(
    (json: string) => window.desktopAPI.support.exportTempSummary(json),
    [],
  )

  const handleCopySupportSummary = useCallback((json: string) => {
    void navigator.clipboard.writeText(json).catch(() => undefined)
  }, [])

  return {
    supportSummaryOpen,
    setSupportSummaryOpen,
    supportSummary,
    supportSummaryLoading,
    supportSummaryError,
    handleSaveSupportSummary,
    handleExportTempSupportSummary,
    handleCopySupportSummary,
  }
}
