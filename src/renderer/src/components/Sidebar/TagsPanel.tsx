import { useMemo } from 'react'
import type { WorkspaceTagIndexEntry } from '../../../../shared/tag-index'
import { buildTagGroups } from '../../lib/tag-index'

/* ==================== 标签面板（侧栏"标签"Tab） ==================== */

interface TagsPanelProps {
  /** 逐文件标签索引（null = 未建索引/无工作区） */
  files: WorkspaceTagIndexEntry[] | null
  loading: boolean
  truncated: boolean
  /** 当前筛选的标签（null = 未筛选）；大小写不敏感 */
  activeTag: string | null
  /** 点击标签：切换文件树筛选；再次点击取消 */
  onToggleTag: (tag: string) => void
  /** 打开筛选列表中的文件 */
  onOpenFile: (path: string) => void
}

const displayName = (path: string): string =>
  path.replace(/\\/g, '/').split('/').pop()?.replace(/\.(md|markdown)$/i, '') ?? path

const displayDir = (path: string): string => {
  const normalized = path.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx > 0 ? normalized.slice(0, idx) : ''
}

/**
 * 标签视图：上半部分为全部标签（按文件数降序），点击标签切换文件树筛选；
 * 选中标签时下半部分列出包含该标签的文件，点击直接打开。
 */
export const TagsPanel = ({
  files,
  loading,
  truncated,
  activeTag,
  onToggleTag,
  onOpenFile,
}: TagsPanelProps): JSX.Element => {
  const groups = useMemo(() => buildTagGroups(files ?? []), [files])
  // 大小写不敏感匹配当前筛选组
  const activeGroup = useMemo(
    () =>
      activeTag
        ? groups.find((g) => g.tag.toLowerCase() === activeTag.toLowerCase()) ?? null
        : null,
    [groups, activeTag],
  )

  if (!files) {
    return (
      <div className="tags-root">
        <div className="backlinks-empty">
          打开工作区后，这里会汇总所有文档 frontmatter 中的标签（tags）。
        </div>
      </div>
    )
  }

  return (
    <div className="tags-root">
      <div className="backlinks-section">
        <div className="backlinks-heading">
          全部标签
          <span className="backlinks-count">{groups.length}</span>
        </div>
        {loading && !groups.length && <div className="backlinks-empty">正在扫描工作区标签…</div>}
        {!loading && groups.length === 0 && (
          <div className="backlinks-empty">
            还没有标签。在文档头部添加 frontmatter：
            <code className="tags-example">{'---\ntags: [笔记, 项目]\n---'}</code>
          </div>
        )}
        <div className="tags-cloud">
          {groups.map((group) => {
            const active = activeTag !== null && group.tag.toLowerCase() === activeTag.toLowerCase()
            return (
              <button
                type="button"
                key={group.tag.toLowerCase()}
                className={`tag-chip ${active ? 'active' : ''}`}
                aria-pressed={active}
                title={`${group.tag}：${group.paths.length} 个文件`}
                onClick={() => onToggleTag(group.tag)}
              >
                {group.tag}
                <span className="tag-chip-count">{group.paths.length}</span>
              </button>
            )
          })}
        </div>
      </div>

      {activeGroup && (
        <div className="backlinks-section">
          <div className="backlinks-heading">
            #{activeGroup.tag}
            <span className="backlinks-count">{activeGroup.paths.length}</span>
          </div>
          {activeGroup.paths.map((path) => (
            <button
              type="button"
              key={path}
              className="backlink-row"
              onClick={() => onOpenFile(path)}
              title={`${displayName(path)}（${displayDir(path)}）`}
            >
              <span className="backlink-name">{displayName(path)}</span>
              <span className="backlink-preview">{displayDir(path)}</span>
            </button>
          ))}
        </div>
      )}

      {truncated && (
        <div className="backlinks-note">工作区文件较多，标签索引仅覆盖部分文件</div>
      )}
    </div>
  )
}
