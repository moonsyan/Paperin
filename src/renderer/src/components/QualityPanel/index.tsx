import type { DiagnosticRecord } from '../../../../shared/workspace-index'
import type { TypographyIssue } from '../../lib/chinese-typography'
import type { SourceHealthRecord } from '../../lib/source-health'
import '../../styles/components/quality-panel.css'

interface QualityPanelProps {
  diagnostics: DiagnosticRecord[]
  indexComplete: boolean
  indexing?: boolean
  onRefresh?: () => void
  onCancel?: () => void
  onOpenDiagnostic?: (diagnostic: DiagnosticRecord) => void
  /** 当前文档的中文排版问题（来自活动文档内容，非工作区索引） */
  typographyIssues?: TypographyIssue[]
  /** 点击排版问题定位到所在行 */
  onOpenTypographyIssue?: (issue: TypographyIssue) => void
  /** 一键修复当前文档的可自动修复项 */
  onFixTypography?: () => void
  sourceHealth?: SourceHealthRecord[]
  onRelocateSource?: (path: string) => void
  onOpenWorkspaceSearch?: () => void
}

const SOURCE_STATUS_LABEL: Record<Exclude<SourceHealthRecord['status'], 'current'>, string> = {
  changed: '来源已变化',
  missing: '来源缺失',
  unverified: '索引未完成',
}

const GROUPS: Array<{ key: DiagnosticRecord['severity']; label: string }> = [
  { key: 'error', label: '错误' },
  { key: 'warning', label: '警告' },
  { key: 'info', label: '提示' },
]

export function QualityPanel({
  diagnostics,
  indexComplete,
  indexing = false,
  onRefresh,
  onCancel,
  onOpenDiagnostic,
  typographyIssues = [],
  onOpenTypographyIssue,
  onFixTypography,
  sourceHealth = [],
  onRelocateSource,
  onOpenWorkspaceSearch,
}: QualityPanelProps): JSX.Element {
  const visibleSources = sourceHealth.filter(
    (record): record is SourceHealthRecord & { status: Exclude<SourceHealthRecord['status'], 'current'> } =>
      record.status !== 'current',
  )
  return (
    <section className="quality-panel" aria-label="质量诊断">
      <header className="quality-panel-header">
        <span>质量诊断</span>
        <div className="quality-panel-actions">
          {indexing && <button type="button" onClick={onCancel}>取消</button>}
          <button type="button" onClick={onRefresh} disabled={indexing}>重新扫描</button>
        </div>
      </header>
      {!indexComplete && (
        <div className="quality-panel-incomplete" role="status">索引未完成，请重新扫描</div>
      )}
      {visibleSources.length > 0 && (
        <div className="quality-group quality-group-source">
          <h3>来源健康（{visibleSources.length}）</h3>
          {visibleSources.map((record) => (
            <div key={`${record.status}:${record.path}`} className="quality-source" role="status">
              <span className="quality-item-message">{SOURCE_STATUS_LABEL[record.status]}</span>
              <span className="quality-item-location">{record.path}</span>
              {record.status === 'missing' && (
                <div className="quality-source-actions">
                  <button type="button" onClick={() => onRelocateSource?.(record.path)}>重新定位</button>
                  <button type="button" onClick={() => onOpenWorkspaceSearch?.()}>打开搜索</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="quality-group quality-group-typography">
        <h3 className="quality-group-title-row">
          中文排版（{typographyIssues.length}）
          <button
            type="button"
            className="quality-fix-btn"
            onClick={onFixTypography}
            disabled={typographyIssues.length === 0 || !onFixTypography}
            title="修复当前文档中可自动处理的排版问题（保留撤销历史）"
          >
            一键修复
          </button>
        </h3>
        {typographyIssues.length === 0 ? (
          <div className="quality-panel-empty">未发现排版问题</div>
        ) : (
          typographyIssues.map((issue, index) => (
            <button
              type="button"
              className="quality-item"
              key={`${issue.code}-${issue.start}-${index}`}
              onClick={() => onOpenTypographyIssue?.(issue)}
              title={`第 ${issue.line} 行：${issue.message}`}
            >
              <span className="quality-item-message">{issue.message}</span>
              <span className="quality-item-location">第 {issue.line} 行</span>
            </button>
          ))
        )}
      </div>
      {GROUPS.map((group) => {
        const items = diagnostics.filter((item) => item.severity === group.key)
        if (items.length === 0) return null
        return (
          <div key={group.key} className={`quality-group quality-group-${group.key}`}>
            <h3>{group.label}（{items.length}）</h3>
            {items.map((item) => (
              <button
                type="button"
                className="quality-item"
                key={item.id}
                onClick={() => onOpenDiagnostic?.(item)}
                title={item.path}
              >
                <span className="quality-item-message">{item.message}</span>
                <span className="quality-item-location">{item.path}{item.line ? `:${item.line}` : ''}</span>
              </button>
            ))}
          </div>
        )
      })}
      {diagnostics.length === 0 && indexComplete && typographyIssues.length === 0 && visibleSources.length === 0 && (
        <div className="quality-panel-empty">未发现问题</div>
      )}
    </section>
  )
}
