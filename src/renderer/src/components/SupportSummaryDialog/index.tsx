import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { SupportSummaryV1 } from '../../../../shared/support-summary'
import { serializeSupportSummary } from '../../../../shared/support-summary'

export interface SupportSummaryDialogProps {
  open: boolean
  summary: SupportSummaryV1 | null
  loading: boolean
  errorMessage?: string | null
  onClose: () => void
  onSave: (json: string) => Promise<{ ok: boolean; error?: { code: string } }>
  onExportTemp: (json: string) => Promise<{ ok: boolean; data?: { fileName: string }; error?: { code: string } }>
  onCopy?: (json: string) => void
}

export function SupportSummaryDialog({
  open,
  summary,
  loading,
  errorMessage,
  onClose,
  onSave,
  onExportTemp,
  onCopy,
}: SupportSummaryDialogProps): JSX.Element | null {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState<'save' | 'temp' | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setActionMessage(null)
    closeRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return
      if (busy) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, busy, onClose])

  const json = summary ? serializeSupportSummary(summary) : ''

  const handleSave = useCallback(async () => {
    if (!summary || busy) return
    setBusy('save')
    setActionMessage(null)
    try {
      const result = await onSave(json)
      if (result.ok) {
        setActionMessage('已保存到你选择的位置。')
      } else if (result.error?.code === 'CANCELLED') {
        setActionMessage('已取消保存。')
      } else {
        setActionMessage('保存失败，请重试。')
      }
    } finally {
      setBusy(null)
    }
  }, [summary, busy, json, onSave])

  const handleExportTemp = useCallback(async () => {
    if (!summary || busy) return
    setBusy('temp')
    setActionMessage(null)
    try {
      const result = await onExportTemp(json)
      if (result.ok && result.data?.fileName) {
        setActionMessage(`已写入系统临时目录：${result.data.fileName}`)
      } else {
        setActionMessage('导出失败，请重试。')
      }
    } finally {
      setBusy(null)
    }
  }, [summary, busy, json, onExportTemp])

  const handleCopy = useCallback(() => {
    if (!summary || busy) return
    onCopy?.(json)
    setActionMessage('摘要 JSON 已复制到剪贴板。')
  }, [summary, busy, json, onCopy])

  if (!open) return null

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div
        className="modal support-summary-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <h2 id={titleId}>支持摘要（脱敏预览）</h2>
          <button ref={closeRef} type="button" className="modal-close" aria-label="关闭" disabled={Boolean(busy)} onClick={onClose}>
            ×
          </button>
        </div>
        <p className="support-summary-hint">
          仅包含版本、平台、索引状态、诊断计数与错误码；不含正文、绝对路径、搜索词或凭据。请先预览，再选择复制或导出。
        </p>
        {loading && <p>正在收集环境信息…</p>}
        {errorMessage && <p role="alert">{errorMessage}</p>}
        <textarea
          className="support-summary-preview"
          readOnly
          aria-label="支持摘要 JSON 预览"
          value={loading ? '' : json}
          rows={16}
        />
        {actionMessage && <p className="support-summary-status">{actionMessage}</p>}
        <div className="modal-actions">
          <button type="button" className="sc-btn" disabled={!summary || Boolean(busy)} onClick={handleCopy}>
            复制 JSON
          </button>
          <button type="button" className="sc-btn" disabled={!summary || Boolean(busy)} onClick={handleExportTemp}>
            {busy === 'temp' ? '导出中…' : '导出到临时文件'}
          </button>
          <button type="button" className="sc-btn primary" disabled={!summary || Boolean(busy)} onClick={handleSave}>
            {busy === 'save' ? '保存中…' : '另存为…'}
          </button>
        </div>
      </div>
    </div>
  )
}
