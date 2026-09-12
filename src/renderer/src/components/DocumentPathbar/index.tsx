import type { JSX } from 'react'
import { displayPath, relativeDirectorySegments } from '../../lib/path-display'

/**
 * 文档路径条（NEXT-UI-SPEC §3.3）。
 *
 * 在正文滚动区上方提供一条约 28px 的轻路径条，回答「当前文件在哪里」：
 * - 库内文件：相对路径分段展示，目录段可点击定位（展开侧栏并展开祖先链）
 * - 外部文件：显示「外部文件」标记与完整路径，不默认移入库
 * - 未命名：显示「未命名 · 尚未保存到磁盘」
 * - 示例：显示「示例文档 · 另存为后保留修改」
 *
 * 只表达位置信息；保存状态归状态栏与标签脏标记，文件名归标签页，
 * 不在此处重复表达。文件名与正文 H1 可以不同，本组件不写正文。
 */

export type DocumentPathKind = 'workspace' | 'external' | 'demo' | 'unnamed'

export interface DocumentPathbarProps {
  title: string
  kind: DocumentPathKind
  path?: string | null
  workspacePath?: string | null
  /** 点击目录段或「定位到文件」：展开侧栏并展开当前文件的祖先目录 */
  onRevealInSidebar?: () => void
}

/** 相对路径的目录段按钮（含分隔符），点击触发定位 */
function DirectoryCrumbs({
  segments,
  onRevealInSidebar,
}: {
  segments: string[]
  onRevealInSidebar?: () => void
}): JSX.Element {
  return (
    <>
      {segments.map((segment, index) => (
        <span key={`${index}-${segment}`} className="pathbar-crumb">
          {onRevealInSidebar ? (
            <button
              type="button"
              className="pathbar-crumb-btn"
              onClick={onRevealInSidebar}
              title={`定位目录：${segment}`}
            >
              {segment}
            </button>
          ) : (
            <span className="pathbar-crumb-btn">{segment}</span>
          )}
          <span className="pathbar-crumb-sep" aria-hidden="true">/</span>
        </span>
      ))}
    </>
  )
}

export function DocumentPathbar({
  title,
  kind,
  path = null,
  workspacePath = null,
  onRevealInSidebar,
}: DocumentPathbarProps): JSX.Element {
  if (kind === 'demo') {
    return (
      <div className="document-pathbar" data-kind="demo" role="status" aria-label={`文档路径：${title}，示例文档 · 另存为后保留修改`}>
        <span className="pathbar-hint">示例文档 · 另存为后保留修改</span>
        <span className="sr-only">{title}</span>
      </div>
    )
  }

  if (kind === 'unnamed') {
    return (
      <div className="document-pathbar" data-kind="unnamed" role="status" aria-label={`文档路径：${title}，未命名 · 尚未保存到磁盘`}>
        <span className="pathbar-hint">未命名 · 尚未保存到磁盘</span>
        <span className="sr-only">{title}</span>
      </div>
    )
  }

  if (kind === 'external') {
    return (
      <div
        className="document-pathbar"
        data-kind="external"
        role="status"
        aria-label={`文档路径：外部文件${path ? ` · ${path}` : ''}`}
        title={path ?? '外部文件'}
      >
        <span className="pathbar-source-tag">外部文件</span>
        <span className="pathbar-fullpath">{path ?? '外部文件'}</span>
        <span className="sr-only">{title}</span>
      </div>
    )
  }

  // workspace：相对路径分段 + 定位按钮；无工作区路径时退化为显示规范化路径
  const relative = displayPath(path, workspacePath, 'workspace')
  const segments = path && workspacePath ? relativeDirectorySegments(path, workspacePath) : null

  return (
    <nav className="document-pathbar" data-kind="workspace" aria-label={`文档路径：${relative}`}>
      {segments && segments.length > 0 && (
        <DirectoryCrumbs segments={segments} onRevealInSidebar={onRevealInSidebar} />
      )}
      <span className="pathbar-file" aria-current="location">{relative.split('/').pop() ?? relative}</span>
      {onRevealInSidebar && (
        <button
          type="button"
          className="pathbar-reveal-btn"
          onClick={onRevealInSidebar}
          title="在侧栏中定位当前文件"
          aria-label={`在侧栏中定位 ${title}`}
        >
          定位到文件
        </button>
      )}
      <span className="sr-only">{title}</span>
    </nav>
  )
}
