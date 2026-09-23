import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useModalDialogKeyboard } from '../../hooks/useModalDialogKeyboard'
import { diffLines } from '../../lib/diff'

/* ==================== 版本历史对话框（本地保存快照） ==================== */

interface SnapshotMeta {
  t: number
  size: number
}

/** 对比视图单次最多渲染的行数，超出部分截断提示（避免大快照卡死 UI） */
const DIFF_RENDER_CAP = 3000

type ViewMode = 'plain' | 'diff-current' | 'diff-prev'

interface VersionHistoryDialogProps {
  open: boolean
  /** 当前文件磁盘路径（null = 未保存文件，不显示入口） */
  filePath: string | null
  docName: string
  /** 编辑器当前实时内容（"对比当前"基线；恢复提示也依赖最新内容） */
  currentContent?: string
  onClose: () => void
  /** 恢复快照：把内容替换进编辑器并标脏（不自动写盘） */
  onRestore: (content: string, t: number) => void
}

const formatTime = (t: number): string => {
  const d = new Date(t)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const formatSize = (size: number): string =>
  size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`

/**
 * 版本历史：列出当前文件的本地保存快照（每次保存成功自动记录，
 * 每文件保留最近 20 份），点击预览全文或以行级 diff 对比
 * （对比当前编辑器内容 / 对比上一版本），"恢复此版本"替换进编辑器。
 */
export function VersionHistoryDialog({
  open,
  filePath,
  docName,
  currentContent = '',
  onClose,
  onRestore,
}: VersionHistoryDialogProps): JSX.Element | null {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<{ t: number; content: string } | null>(null)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('plain')
  /** "对比上一版"所需的上一份快照内容（按选中项懒加载） */
  const [prevSnapshot, setPrevSnapshot] = useState<{ t: number; content: string } | null>(null)
  const [prevLoading, setPrevLoading] = useState(false)
  // 三个异步流各自独立序号：共用一个会让后发请求作废在途的先发请求
  // （点快照后立刻点"对比上一版"，预览读取被静默吞掉且无提示）
  const listSeqRef = useRef(0)
  const previewSeqRef = useRef(0)
  const prevSeqRef = useRef(0)

  useEffect(() => {
    const seq = ++listSeqRef.current
    if (!open) {
      setSnapshots([])
      setPreview(null)
      setError('')
      setLoading(false)
      setViewMode('plain')
      setPrevSnapshot(null)
      previewSeqRef.current += 1
      prevSeqRef.current += 1
      return
    }
    if (!filePath || !window.desktopAPI?.history) return
    setLoading(true)
    setPreview(null)
    setError('')
    window.desktopAPI.history
      .list(filePath)
      .then((res) => {
        if (seq !== listSeqRef.current) return
        if (res.ok && res.data) setSnapshots(res.data.snapshots)
        else setError('读取版本历史失败')
      })
      .catch(() => {
        if (seq === listSeqRef.current) setError('读取版本历史失败')
      })
      .finally(() => {
        if (seq === listSeqRef.current) setLoading(false)
      })
  }, [open, filePath])

  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useModalDialogKeyboard({
    open,
    onClose,
    dialogRef,
    initialFocusRef: closeButtonRef,
  })

  if (!open) return null

  const selectedIndex = preview ? snapshots.findIndex((s) => s.t === preview.t) : -1
  const hasPrevVersion = selectedIndex >= 0 && selectedIndex < snapshots.length - 1
  const effectiveMode: ViewMode =
    viewMode === 'diff-prev' && !prevSnapshot ? 'plain' : viewMode

  const handlePreview = async (t: number) => {
    if (!filePath || !window.desktopAPI?.history) return
    const seq = ++previewSeqRef.current
    // 切换预览目标时作废在途的"上一版"加载：其结果会挂到错误的选中项上
    prevSeqRef.current += 1
    try {
      const res = await window.desktopAPI.history.read(filePath, t)
      if (seq !== previewSeqRef.current) return
      if (res.ok && res.data) {
        setPreview({ t, content: res.data.content })
        setViewMode('plain')
        setPrevSnapshot(null)
      } else {
        setError('快照内容读取失败')
      }
    } catch {
      if (seq === previewSeqRef.current) setError('快照内容读取失败')
    }
  }

  /** 切到"对比上一版"时懒加载列表中紧邻的更早快照 */
  const ensurePrevSnapshot = async (): Promise<boolean> => {
    if (prevSnapshot || !hasPrevVersion || !filePath || !window.desktopAPI?.history) {
      return Boolean(prevSnapshot)
    }
    const prevMeta = snapshots[selectedIndex + 1]
    const seq = ++prevSeqRef.current
    setPrevLoading(true)
    try {
      const res = await window.desktopAPI.history.read(filePath, prevMeta.t)
      if (seq !== prevSeqRef.current) return false
      if (res.ok && res.data) {
        setPrevSnapshot({ t: prevMeta.t, content: res.data.content })
        return true
      }
      setError('上一版本内容读取失败')
      return false
    } catch {
      if (seq === prevSeqRef.current) setError('上一版本内容读取失败')
      return false
    } finally {
      if (seq === prevSeqRef.current) setPrevLoading(false)
    }
  }

  const handleViewMode = (mode: ViewMode) => {
    if (mode === viewMode) return
    if (mode === 'diff-prev') {
      void ensurePrevSnapshot().then((ok) => {
        if (ok) setViewMode('diff-prev')
      })
      return
    }
    setViewMode(mode)
  }

  const handleRestore = () => {
    if (!preview) return
    const confirmed = window.confirm(
      `将编辑器内容恢复到 ${formatTime(preview.t)} 的快照？\n\n当前未保存的修改会以历史内容替换（不会自动写入磁盘，可再手动 Ctrl+S 保存或继续修改）。`,
    )
    if (!confirmed) return
    onRestore(preview.content, preview.t)
  }

  /** 对比结果（仅在实际的 diff 模式下计算） */
  let diffView: ReturnType<typeof diffLines> | null = null
  if (preview && effectiveMode === 'diff-current') {
    diffView = diffLines(preview.content, currentContent)
  } else if (preview && effectiveMode === 'diff-prev' && prevSnapshot) {
    // 快照列表新在前：与更早的上一版对比（旧=上一版，新=选中快照）
    diffView = diffLines(prevSnapshot.content, preview.content)
  }
  const renderCapped =
    diffView !== null && diffView.lines.length > DIFF_RENDER_CAP
  const renderedLines = renderCapped ? diffView!.lines.slice(0, DIFF_RENDER_CAP) : diffView?.lines ?? []

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="dialog version-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help-header">
          <span className="help-title" id="version-history-title">版本历史 · {docName}</span>
          <button
            type="button"
            ref={closeButtonRef}
            className="dialog-close"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
          >
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="version-body">
          <div className="version-list" role="listbox" aria-label="历史快照列表">
            {loading && <div className="version-empty">正在读取版本历史…</div>}
            {!loading && !error && snapshots.length === 0 && (
              <div className="version-empty">还没有历史版本。每次保存成功后会自动记录一个快照。</div>
            )}
            {error && <div className="ws-error">{error}</div>}
            {snapshots.map((snap, i) => (
              <button
                type="button"
                key={snap.t}
                role="option"
                aria-selected={preview?.t === snap.t}
                className={`version-item ${i === 0 ? 'newest' : ''} ${preview?.t === snap.t ? 'active' : ''}`}
                onClick={() => void handlePreview(snap.t)}
                title={`${formatTime(snap.t)}（${formatSize(snap.size)}）`}
              >
                <span className="version-item-time">{formatTime(snap.t)}</span>
                <span className="version-item-size">{formatSize(snap.size)}</span>
                {i === 0 && <span className="version-item-badge">最新</span>}
              </button>
            ))}
          </div>
          <div className="version-preview">
            {preview && (
              <div className="version-toolbar" role="tablist" aria-label="预览方式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveMode === 'plain'}
                  className={`version-tab ${effectiveMode === 'plain' ? 'active' : ''}`}
                  onClick={() => handleViewMode('plain')}
                >
                  全文
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveMode === 'diff-current'}
                  className={`version-tab ${effectiveMode === 'diff-current' ? 'active' : ''}`}
                  onClick={() => handleViewMode('diff-current')}
                >
                  对比当前
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveMode === 'diff-prev'}
                  className={`version-tab ${effectiveMode === 'diff-prev' ? 'active' : ''}`}
                  disabled={!hasPrevVersion}
                  title={hasPrevVersion ? undefined : '没有更早的版本可对比'}
                  onClick={() => handleViewMode('diff-prev')}
                >
                  对比上一版
                </button>
                {effectiveMode !== 'plain' && diffView && (
                  <span className="version-diff-stat" aria-live="polite">
                    <span className="stat-add">+{diffView.added}</span>{' '}
                    <span className="stat-del">−{diffView.removed}</span>
                  </span>
                )}
              </div>
            )}
            {prevLoading && <div className="version-empty">正在读取上一版本…</div>}
            {!prevLoading && preview && effectiveMode === 'plain' && (
              <pre className="version-pre">{preview.content}</pre>
            )}
            {!prevLoading && preview && effectiveMode !== 'plain' && diffView && (
              <div className="version-diff" role="table" aria-label="差异对比">
                {diffView.truncated && (
                  <div className="version-diff-notice">
                    差异区域过大，已按整块替换展示（不逐行对齐）
                  </div>
                )}
                {renderedLines.map((line, i) => (
                  <div key={i} className={`diff-row diff-${line.type}`} role="row">
                    <span className="diff-gutter">
                      {line.oldNumber ?? ''}
                    </span>
                    <span className="diff-gutter">
                      {line.newNumber ?? ''}
                    </span>
                    <span className="diff-sign">{line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}</span>
                    <span className="diff-text">{line.text}</span>
                  </div>
                ))}
                {renderCapped && (
                  <div className="version-diff-notice">
                    已省略后续 {diffView!.lines.length - DIFF_RENDER_CAP} 行
                  </div>
                )}
              </div>
            )}
            {!preview && !prevLoading && (
              <div className="version-empty">点击左侧快照预览内容或对比差异</div>
            )}
          </div>
        </div>
        <div className="version-footer">
          <span className="version-hint">恢复只替换编辑器内容并标记未保存，需手动 Ctrl+S 写入磁盘</span>
          <button type="button" className="dialog-btn" disabled={!preview} onClick={handleRestore}>
            恢复此版本
          </button>
        </div>
      </div>
    </div>
  )
}
