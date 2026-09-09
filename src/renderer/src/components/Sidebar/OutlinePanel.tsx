import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { parseOutline, type OutlineNode } from '../../lib/outline'
import { computeSectionStats } from '../../lib/section-stats'

/** 章节字数显示：万以下精确计数，更大时以"万"为单位保留一位小数 */
const formatSectionWords = (words: number): string =>
  words >= 10000 ? `${(Math.round(words / 1000) / 10).toFixed(1)} 万字` : `${words} 字`

interface OutlinePanelProps {
  content: string
  /** 文档身份标识（如文件 id / 路径）；其值变化表示切换了文档 */
  docKey: string
  activeOutlineIndex: number
  onOutlineClick: (index: number) => void
}

export const OutlinePanel = ({
  content,
  docKey,
  activeOutlineIndex,
  onOutlineClick,
}: OutlinePanelProps): JSX.Element => {
  const deferredContent = useDeferredValue(content)
  const [collapsedHeadings, setCollapsedHeadings] = useState<Set<number>>(new Set())
  const outlineTree = parseOutline(deferredContent)
  // 章节统计与 parseOutline 共用同一标题扫描口径，sections[node.idx] 一一对应
  const sectionStats = useMemo(() => computeSectionStats(deferredContent), [deferredContent])

  // 切换文档时重置折叠态：折叠态以标题顺序 idx 为键，若不清空，
  // 旧文档的折叠状态会错配到新文档同序号标题。
  const prevDocKeyRef = useRef(docKey)
  useEffect(() => {
    if (prevDocKeyRef.current !== docKey) {
      prevDocKeyRef.current = docKey
      setCollapsedHeadings(new Set())
    }
  }, [docKey])

  const handleToggleHeading = (index: number) => {
    setCollapsedHeadings((previous) => {
      const next = new Set(previous)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, node: OutlineNode) => {
    if (node.children.length === 0) return
    const collapsed = collapsedHeadings.has(node.idx)
    if (event.key === 'ArrowRight' && collapsed) {
      event.preventDefault()
      handleToggleHeading(node.idx)
      return
    }
    if (event.key !== 'ArrowLeft' || collapsed) return
    event.preventDefault()
    handleToggleHeading(node.idx)
  }

  const renderNode = (node: OutlineNode): JSX.Element => {
    const hasChildren = node.children.length > 0
    const collapsed = collapsedHeadings.has(node.idx)
    const isActive = node.idx === activeOutlineIndex
    const section = sectionStats.sections[node.idx]
    const wordsTitle = section
      ? `本节 ${formatSectionWords(section.words)}，约 ${section.readingMinutes} 分钟`
      : undefined

    return (
      <div key={node.idx} className="outline-node">
        <button
          type="button"
          className={`outline-row outline-h${node.level} ${isActive ? 'active' : ''}`}
          onClick={() => onOutlineClick(node.idx)}
          onKeyDown={(event) => handleKeyDown(event, node)}
          aria-expanded={hasChildren ? !collapsed : undefined}
          title={node.text}
        >
          {hasChildren ? (
            <span
              className={`outline-caret ${collapsed ? '' : 'open'}`}
              onClick={(event) => {
                event.stopPropagation()
                handleToggleHeading(node.idx)
              }}
            >
              <svg viewBox="0 0 24 24">
                <polyline points="9 6 15 12 9 18" />
              </svg>
            </span>
          ) : (
            <span className="outline-caret outline-caret-empty" />
          )}
          <span className="outline-text">{node.text}</span>
          {section && (
            <span className="outline-words" title={wordsTitle}>
              {formatSectionWords(section.words)}
            </span>
          )}
        </button>
        {hasChildren && !collapsed && (
          <div className="outline-sub">{node.children.map(renderNode)}</div>
        )}
      </div>
    )
  }

  if (outlineTree.length === 0) return <div className="outline-empty">暂无标题</div>
  return <div className="outline-root">{outlineTree.map(renderNode)}</div>
}
