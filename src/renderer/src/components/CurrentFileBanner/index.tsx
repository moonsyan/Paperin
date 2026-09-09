import type { JSX } from 'react'

export type CurrentFileSource = 'workspace' | 'external'

export interface CurrentFileBannerProps {
  title: string
  path?: string | null
  workspacePath?: string | null
  workspaceName?: string | null
  source: CurrentFileSource
  dirty: boolean
}

const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+/g, '/')

const displayPath = (path: string | null | undefined, workspacePath: string | null | undefined, source: CurrentFileSource): string => {
  if (!path) return source === 'external' ? '外部文件' : '未保存文档'
  const normalizedPath = normalizePath(path)
  if (source !== 'workspace' || !workspacePath) return normalizedPath
  const root = normalizePath(workspacePath).replace(/\/$/, '')
  const comparablePath = normalizedPath.toLocaleLowerCase()
  const comparableRoot = root.toLocaleLowerCase()
  if (comparablePath === comparableRoot) return normalizedPath.split('/').pop() ?? normalizedPath
  if (comparablePath.startsWith(`${comparableRoot}/`)) return normalizedPath.slice(root.length + 1)
  return normalizedPath
}

export function CurrentFileBanner({
  title,
  path = null,
  workspacePath = null,
  workspaceName = null,
  source,
  dirty,
}: CurrentFileBannerProps): JSX.Element {
  const sourceLabel = source === 'workspace' ? '知识库文件' : '外部文件'
  const statusLabel = dirty ? '未保存' : '已保存'
  const pathLabel = displayPath(path, workspacePath, source)

  return (
    <div
      className={`current-file-banner current-file-banner-${source}`}
      role="status"
      aria-live="polite"
      aria-label={`当前文件：${title}，${sourceLabel}，${statusLabel}`}
      data-source={source}
      data-dirty={dirty ? 'true' : 'false'}
    >
      <span className="current-file-banner-marker" aria-hidden="true" />
      <div className="current-file-banner-copy">
        <div className="current-file-banner-context">
          <span className="current-file-banner-workspace">{workspaceName ?? '本地工作区'}</span>
          <span className="current-file-banner-separator" aria-hidden="true">/</span>
          <span className="current-file-banner-source">{sourceLabel}</span>
        </div>
        <strong className="current-file-banner-title" title={title}>{title}</strong>
        <span className="current-file-banner-path" title={pathLabel}>{pathLabel}</span>
      </div>
      <span className={`current-file-banner-status ${dirty ? 'is-dirty' : 'is-saved'}`}>
        <span className="current-file-banner-status-dot" aria-hidden="true" />
        {statusLabel}
      </span>
    </div>
  )
}
