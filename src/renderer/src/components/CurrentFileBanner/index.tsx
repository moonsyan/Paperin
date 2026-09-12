import type { JSX } from 'react'
import { displayPath } from '../../lib/path-display'

export type CurrentFileSource = 'workspace' | 'external'

export interface CurrentFileBannerProps {
  title: string
  path?: string | null
  workspacePath?: string | null
  workspaceName?: string | null
  source: CurrentFileSource
  dirty: boolean
}

/**
 * 当前文件上下文（原「当前文件」独立横条）。
 *
 * 收敛后不再占用一整条 52px 横向空间，而是作为顶栏右区的一枚紧凑标识：
 * 只保留「来源 + 相对路径」两项在视觉上最重要的信息，文件名交给标签页，
 * 保存状态交给状态栏与标签脏标记；工作区名与文件名保留在无障碍树中。
 *
 * `role="status"` / `data-source` / `data-dirty` 与可见文本均保持向后兼容。
 */
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
      title={`${workspaceName ?? '本地工作区'} · ${sourceLabel} · ${pathLabel} · ${statusLabel}`}
    >
      <span className="current-file-banner-marker" aria-hidden="true" />
      <span className="current-file-banner-source">{sourceLabel}</span>
      <span className="current-file-banner-path" title={pathLabel}>{pathLabel}</span>
      <span className={`current-file-banner-status ${dirty ? 'is-dirty' : 'is-saved'}`}>
        <span className="current-file-banner-status-dot" aria-hidden="true" />
        {statusLabel}
      </span>
      {/* 无障碍补充：工作区名与文件名在紧凑形态下不占视觉空间 */}
      <span className="sr-only">{workspaceName ?? '本地工作区'}</span>
      <span className="sr-only">{title}</span>
    </div>
  )
}
