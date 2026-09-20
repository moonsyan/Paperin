import { useRef, useState } from 'react'
import { useModalDialogKeyboard } from '../../hooks/useModalDialogKeyboard'
import type { PublishOptions, PublishScope, PublishTemplate } from '../../lib/export-bundle'

interface PublishDialogProps {
  open: boolean
  onClose: () => void
  /** 导出 HTML 资源包（index.html + assets/）；范围非当前文档时导出集合 */
  onExportBundle: (options: PublishOptions, scope: PublishScope) => void
  /** 复制富文本（text/html + text/plain），仅当前文档 */
  onCopyRichText: (options: PublishOptions) => void
  /** 任务进行中：禁用按钮防重复提交 */
  busy?: boolean
  /** 是否处于工作区（集合范围仅工作区可用） */
  hasWorkspace?: boolean
  /** 工作区已有标签（按标签集合的建议项） */
  availableTags?: string[]
}

const TEMPLATES: { id: PublishTemplate; label: string; desc: string }[] = [
  { id: 'blog', label: '博客', desc: '通用正文排版，适合个人博客与静态站点' },
  { id: 'technical', label: '技术文档', desc: '宽版式 + 代码块强调，适合 API 与开发文档' },
  { id: 'paper', label: '论文', desc: '衬线字体 + 标题页，适合学术与正式报告' },
  { id: 'wechat', label: '公众号', desc: '窄栏紧凑排版，默认内联图片便于粘贴' },
]

/**
 * 发布弹窗：模板选择 + 导出选项 + 两个动作（资源包导出 / 富文本复制）。
 * 模板只改变导出 CSS、标题页与目录，不改动正文内容。
 */
export function PublishDialog({
  open,
  onClose,
  onExportBundle,
  onCopyRichText,
  busy = false,
  hasWorkspace = false,
  availableTags = [],
}: PublishDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [template, setTemplate] = useState<PublishTemplate>('blog')
  const [includeToc, setIncludeToc] = useState(true)
  const [inlineImages, setInlineImages] = useState(true)
  const [cleanWikiLinks, setCleanWikiLinks] = useState(true)
  const [scopeKind, setScopeKind] = useState<PublishScope['kind']>('document')
  const [tagInput, setTagInput] = useState(availableTags[0] ?? '')

  useModalDialogKeyboard({
    open,
    onClose,
    dialogRef,
    initialFocusRef: closeButtonRef,
    closeOnEscape: !busy,
  })

  if (!open) return null
  const dialogTitleId = 'publish-dialog-title'

  const options: PublishOptions = { template, includeToc, inlineImages, cleanWikiLinks }
  const trimmedTag = tagInput.trim()
  const isCollectionScope = scopeKind === 'directory' || scopeKind === 'tag'
  const tagScopeIncomplete = scopeKind === 'tag' && !trimmedTag
  const scope: PublishScope =
    scopeKind === 'tag'
      ? { kind: 'tag', tag: trimmedTag }
      : scopeKind === 'directory'
        ? { kind: 'directory' }
        : { kind: 'document' }
  const exportDisabled = busy || tagScopeIncomplete
  const copyRichTextDisabled = busy || isCollectionScope

  return (
    <div className="dialog-overlay" onClick={busy ? undefined : onClose}>
      <div
        ref={dialogRef}
        className="dialog publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help-header">
          <span id={dialogTitleId} className="help-title">
            发布
          </span>
          <button
            ref={closeButtonRef}
            type="button"
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
        <div className="publish-dialog-body">
          <div className="settings-row">
            <span className="settings-label">模板</span>
          </div>
          <div className="seg publish-template-seg" role="radiogroup" aria-label="发布模板">
            {TEMPLATES.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`seg-item ${template === item.id ? 'on' : ''}`}
                role="radio"
                aria-checked={template === item.id}
                title={item.desc}
                onClick={() => setTemplate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="publish-template-desc">
            {TEMPLATES.find((item) => item.id === template)?.desc}
          </p>

          {hasWorkspace && (
            <>
              <div className="settings-row">
                <span className="settings-label">发布范围</span>
                <div className="seg" role="radiogroup" aria-label="发布范围">
                  {(
                    [
                      { id: 'document', label: '当前文档' },
                      { id: 'directory', label: '当前目录' },
                      { id: 'tag', label: '按标签' },
                    ] as const
                  ).map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`seg-item ${scopeKind === item.id ? 'on' : ''}`}
                      role="radio"
                      aria-checked={scopeKind === item.id}
                      onClick={() => setScopeKind(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              {scopeKind === 'tag' && (
                <div className="settings-row">
                  <span className="settings-label">
                    标签
                    <span className="settings-hint">按 Frontmatter tags 收集该标签下的全部文档</span>
                  </span>
                  <input
                    className="settings-text-input"
                    list="publish-tag-options"
                    value={tagInput}
                    placeholder="输入标签"
                    aria-required="true"
                    aria-invalid={tagScopeIncomplete}
                    aria-describedby={tagScopeIncomplete ? 'publish-tag-required' : undefined}
                    onChange={(e) => setTagInput(e.target.value)}
                  />
                  <datalist id="publish-tag-options">
                    {availableTags.map((tag) => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                  {tagScopeIncomplete && (
                    <p id="publish-tag-required" className="settings-hint publish-scope-block">
                      请输入标签后再导出；不会改为仅导出当前文档。
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <button
            type="button"
            className="settings-row settings-row-toggle"
            aria-pressed={includeToc}
            onClick={() => setIncludeToc((v) => !v)}
          >
            <span className="settings-label">
              目录页
              <span className="settings-hint">文首生成可跳转目录（H1–H3，标题≥2 个时生效）</span>
            </span>
            <span className={`switch ${includeToc ? 'on' : ''}`} />
          </button>
          <button
            type="button"
            className="settings-row settings-row-toggle"
            aria-pressed={inlineImages}
            onClick={() => setInlineImages((v) => !v)}
          >
            <span className="settings-label">
              图片内联
              <span className="settings-hint">开：图片转为 base64 打进单个 HTML；关：图片写入 assets/ 文件夹</span>
            </span>
            <span className={`switch ${inlineImages ? 'on' : ''}`} />
          </button>
          <button
            type="button"
            className="settings-row settings-row-toggle"
            aria-pressed={cleanWikiLinks}
            onClick={() => setCleanWikiLinks((v) => !v)}
          >
            <span className="settings-label">
              清理 Wiki 链接
              <span className="settings-hint">导出前把 [[双链]] 展开为纯文本，避免发布目标无法解析</span>
            </span>
            <span className={`switch ${cleanWikiLinks ? 'on' : ''}`} />
          </button>

          <div className="publish-actions">
            <button
              type="button"
              className="publish-primary"
              disabled={exportDisabled}
              aria-describedby={tagScopeIncomplete ? 'publish-tag-required' : undefined}
              onClick={() => onExportBundle(options, scope)}
            >
              {busy ? '处理中…' : '导出 HTML 资源包…'}
            </button>
            <button
              type="button"
              className="publish-secondary"
              disabled={copyRichTextDisabled}
              title={copyRichTextDisabled && !busy ? '仅「当前文档」模式可复制富文本' : undefined}
              aria-describedby={copyRichTextDisabled && !busy ? 'publish-copy-scope-hint' : undefined}
              onClick={() => onCopyRichText(options)}
            >
              复制当前文档富文本
            </button>
          </div>
          {copyRichTextDisabled && !busy && (
            <p id="publish-copy-scope-hint" className="settings-hint publish-scope-block">
              集合模式仅支持导出 HTML 资源包，不能复制合并后的富文本。
            </p>
          )}
          <p className="publish-hint">
            {scopeKind === 'document'
              ? '资源包包含 index.html 与 assets/ 图片文件夹，可独立打开或托管；复制富文本后可直接粘贴到公众号、邮件等编辑器。'
              : '集合模式按 Frontmatter order 合并多篇文档为单个 HTML 资源包（复杂公式/图表建议逐篇导出）；每篇标题来自 Frontmatter title 或首个标题。'}
          </p>
        </div>
      </div>
    </div>
  )
}
