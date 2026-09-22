import { useEffect, useId, useRef, useState } from 'react'
import { isImeComposing } from '../../lib/keyboard'
import type { MarkdownLinkReplacementPreview, SourceRelocationChoice } from '../../lib/source-relocation'
import type { SourceRelocationCandidate } from '../../lib/source-relocation'
import '../../styles/components/source-relocation-dialog.css'

export interface SourceRelocationConfirmProps {
  open: boolean
  previousPath: string
  selectedPath: string
  selectedModifiedTime: number
  linkPreviews: MarkdownLinkReplacementPreview[]
  onConfirm: (choice: SourceRelocationChoice) => void
  onCancel: () => void
}

export function SourceRelocationDialog({
  open,
  previousPath,
  selectedPath,
  selectedModifiedTime,
  linkPreviews,
  onConfirm,
  onCancel,
}: SourceRelocationConfirmProps): JSX.Element | null {
  const titleId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const [updateMarkdownLink, setUpdateMarkdownLink] = useState(false)

  useEffect(() => {
    if (!open) return
    setUpdateMarkdownLink(false)
    confirmRef.current?.focus()
  }, [open, previousPath, selectedPath])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isImeComposing(event)) return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onCancel])

  if (!open) return null

  const handleConfirm = (): void => {
    onConfirm({
      previousPath,
      selectedPath,
      selectedModifiedTime,
      updateMarkdownLink,
    })
  }

  return (
    <div className="dialog-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div
        className="dialog source-relocation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="source-relocation-title">确认来源重定位</h2>
        <p className="source-relocation-lead">
          将把当前文章的来源基线从缺失路径更新为你选择的新文件。默认不修改正文。
        </p>
        <dl className="source-relocation-paths">
          <div>
            <dt>原路径</dt>
            <dd>{previousPath}</dd>
          </div>
          <div>
            <dt>新路径</dt>
            <dd>{selectedPath}</dd>
          </div>
        </dl>
        <label className="source-relocation-checkbox">
          <input
            type="checkbox"
            aria-label="更新当前文档 Markdown 链接"
            checked={updateMarkdownLink}
            onChange={(event) => setUpdateMarkdownLink(event.target.checked)}
          />
          同时更新当前文档中的普通 Markdown 链接（可撤销）
        </label>
        {updateMarkdownLink && (
          <div className="source-relocation-previews" role="region" aria-label="链接替换预览">
            <p className="source-relocation-preview-count">
              将影响 {linkPreviews.length} 处链接
            </p>
            {linkPreviews.length === 0 ? (
              <p className="source-relocation-preview-empty">未找到指向原路径的普通 Markdown 链接</p>
            ) : (
              linkPreviews.map((item, index) => (
                <div key={`${item.start}-${index}`} className="source-relocation-preview-row">
                  <span className="source-relocation-preview-label">替换前</span>
                  <code>{item.before}</code>
                  <span className="source-relocation-preview-label">替换后</span>
                  <code>{item.after}</code>
                </div>
              ))
            )}
          </div>
        )}
        <div className="dialog-actions source-relocation-actions">
          <button type="button" className="dialog-btn" onClick={onCancel}>取消</button>
          <button
            type="button"
            className="dialog-btn primary"
            ref={confirmRef}
            onClick={handleConfirm}
          >
            更新来源基线
          </button>
        </div>
      </div>
    </div>
  )
}

export interface SourceRelocationCandidateDialogProps {
  open: boolean
  previousPath: string
  candidates: SourceRelocationCandidate[]
  onSelect: (candidate: SourceRelocationCandidate) => void
  onSearchInstead: () => void
  onCancel: () => void
}

/** 同名多候选时必须显式选择，不能自动假定第一个。 */
export function SourceRelocationCandidateDialog({
  open,
  previousPath,
  candidates,
  onSelect,
  onSearchInstead,
  onCancel,
}: SourceRelocationCandidateDialogProps): JSX.Element | null {
  const titleId = useId()
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    firstRef.current?.focus()
  }, [open, candidates])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isImeComposing(event)) return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="dialog-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div
        className="dialog source-relocation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="source-relocation-title">选择同名来源</h2>
        <p className="source-relocation-lead">
          「{previousPath}」对应多个同名文件，请选择要绑定的新来源，或使用搜索指定其他路径。
        </p>
        <ul className="source-relocation-candidate-list">
          {candidates.map((candidate, index) => (
            <li key={candidate.relativePath}>
              <button
                type="button"
                className="source-relocation-candidate-btn"
                ref={index === 0 ? firstRef : undefined}
                onClick={() => onSelect(candidate)}
              >
                <span className="source-relocation-candidate-path">{candidate.relativePath}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="dialog-actions source-relocation-actions">
          <button type="button" className="dialog-btn" onClick={onCancel}>取消</button>
          <button type="button" className="dialog-btn" onClick={onSearchInstead}>改用搜索</button>
        </div>
      </div>
    </div>
  )
}
