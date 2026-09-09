/* ==================== 高级设置面板 ==================== */

interface AdvancedPanelProps {
  /** 已导入的导出模板 CSS 文件名（null = 使用默认样式） */
  exportCssName?: string | null
  onImportExportCss: () => void
  onRemoveExportCss: () => void
}

export function AdvancedPanel({
  exportCssName,
  onImportExportCss,
  onRemoveExportCss,
}: AdvancedPanelProps): JSX.Element {
  return (
    <>
      <div className="settings-section-title">导出</div>
      <div className="settings-row">
        <span className="settings-label">
          导出样式 CSS
          <span className="settings-hint">
            {exportCssName
              ? `已导入：${exportCssName}（追加在默认样式后，可覆盖字体/颜色等）`
              : '导入自己的 CSS 文件，自定义导出 HTML/PDF 的排版样式'}
          </span>
        </span>
        <div className="sc-edit-group">
          <button type="button" className="sc-btn" onClick={onImportExportCss}>
            {exportCssName ? '重新导入' : '导入'}
          </button>
          {exportCssName && (
            <button type="button" className="sc-btn" onClick={onRemoveExportCss}>
              移除
            </button>
          )}
        </div>
      </div>
      <div className="settings-row">
        <span className="settings-label">
          版本历史
          <span className="settings-hint">
            每次保存成功自动记录快照（每文件最近 20 份）；入口在文件菜单"版本历史…"
          </span>
        </span>
      </div>
    </>
  )
}
