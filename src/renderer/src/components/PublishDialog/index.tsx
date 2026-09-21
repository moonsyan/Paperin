import { useRef, useState } from 'react'
import { useModalDialogKeyboard } from '../../hooks/useModalDialogKeyboard'
import type { PublishOptions, PublishProfile, PublishScope, PublishTemplate } from '../../../../shared/publish-profile'
import { PublishDialogFields } from './PublishDialogFields'
import { PublishProfileControls } from './PublishProfileControls'

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
  profiles?: PublishProfile[]
  onSaveProfile?: (name: string, options: PublishOptions, scope: PublishScope) => void
  onDeleteProfile?: (id: string) => void
}

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
  profiles = [],
  onSaveProfile,
  onDeleteProfile,
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

  const handleApplyProfile = (profile: PublishProfile): void => {
    setTemplate(profile.options.template)
    setIncludeToc(profile.options.includeToc)
    setInlineImages(profile.options.inlineImages)
    setCleanWikiLinks(profile.options.cleanWikiLinks)
    setScopeKind(profile.scope.kind)
    if (profile.scope.kind === 'tag') setTagInput(profile.scope.tag)
  }

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
          {onSaveProfile && onDeleteProfile && (
            <PublishProfileControls
              profiles={profiles}
              busy={busy}
              onApply={handleApplyProfile}
              onSave={(name) => onSaveProfile(name, options, scope)}
              onDelete={onDeleteProfile}
            />
          )}
          <PublishDialogFields
            template={template}
            includeToc={includeToc}
            inlineImages={inlineImages}
            cleanWikiLinks={cleanWikiLinks}
            scopeKind={scopeKind}
            tagInput={tagInput}
            tagScopeIncomplete={tagScopeIncomplete}
            hasWorkspace={hasWorkspace}
            availableTags={availableTags}
            onTemplateChange={setTemplate}
            onIncludeTocChange={() => setIncludeToc((value) => !value)}
            onInlineImagesChange={() => setInlineImages((value) => !value)}
            onCleanWikiLinksChange={() => setCleanWikiLinks((value) => !value)}
            onScopeKindChange={setScopeKind}
            onTagInputChange={setTagInput}
          />
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
              ? '资源包包含 index.html、assets/ 与 reports/paperin-delivery-report.json；复制富文本后可粘贴到公众号、邮件等编辑器。'
              : '集合模式按 Frontmatter order 合并多篇文档为单个 HTML 资源包（复杂公式/图表建议逐篇导出）；每篇标题来自 Frontmatter title 或首个标题。'}
          </p>
        </div>
      </div>
    </div>
  )
}
