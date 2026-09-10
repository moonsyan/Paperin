import { useCallback, useEffect, useRef, useState } from 'react'
import type { OpenFile } from '../Sidebar'
import { getTabNavigationTargetId, type DocumentTabNavigationKey } from '../../lib/document-tabs'
import { clampMenuPosition } from '../../lib/menu-position'
import { TabContextMenu, type TabContextMenuState } from './TabContextMenu'

interface TabBarProps {
  openFiles: OpenFile[]
  activeFileId: string
  savedMap: Record<string, boolean>
  onSwitch: (id: string) => void
  onClose: (id: string) => void
  /** 右键菜单：关闭其他标签页（保留当前激活的标签） */
  onCloseOthers: (id: string) => void
  /** 右键菜单：关闭全部标签页 */
  onCloseAll: () => void
  /** 固定或取消固定标签页 */
  onTogglePin: (id: string) => void
  /** 拖拽排序：把 from 位置的文件移动到 to 位置 */
  onReorder: (from: number, to: number) => void
  /** 知识图谱标签是否打开（固定在标签栏末尾，不参与拖拽排序） */
  graphTabOpen: boolean
  /** 知识图谱标签是否激活（激活时文件标签全部失去激活态） */
  graphTabActive: boolean
  /** 点击图谱标签：激活图谱（已激活时忽略） */
  onGraphTabSwitch: () => void
  /** 关闭图谱标签 */
  onGraphTabClose: () => void
}

/**
 * 多标签页栏（对标 Typora）：展示所有已打开文档，点击切换、关闭按钮收起、
 * 支持拖拽排序。复用现有 openFiles / activeFileId 状态，不改动单文档内核。
 * 右键标签弹出菜单：关闭 / 关闭其他 / 关闭全部；中键点击直接关闭。
 * 末尾固定"知识图谱"内置标签（Obsidian 式），不参与排序与右键菜单。
 */
export function TabBar({ openFiles, activeFileId, savedMap, onSwitch, onClose, onCloseOthers, onCloseAll, onTogglePin, onReorder, graphTabOpen, graphTabActive, onGraphTabSwitch, onGraphTabClose }: TabBarProps) {
  // D8：拖拽记录被拖标签的 id 而非下标——openFiles 可能在拖拽中变化
  //（预览标签替换、其它标签关闭等），落点与高亮也按 id 追踪：
  // 闭包里的渲染下标 i 在 openFiles 变化后过期，落点会插到错误位置
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // 右键菜单：{ 触发标签 id, 屏幕坐标 }
  const [ctxMenu, setCtxMenu] = useState<TabContextMenuState | null>(null)

  const dismissTabMenu = useCallback((restoreFocus: boolean) => {
    const trigger = ctxMenu?.trigger
    setCtxMenu(null)
    if (restoreFocus && trigger?.isConnected) trigger.focus()
  }, [ctxMenu])

  // 切换/拖拽后把激活标签滚入可视区（标签多到溢出时，从侧栏点开文件
  // 不再"看不到当前标签"）
  useEffect(() => {
    tabRefs.current[activeFileId]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeFileId, openFiles.length])

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, fileId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSwitch(fileId)
      return
    }
    // 上下文菜单键 / Shift+F10：打开该标签的右键菜单
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const pos = clampMenuPosition(rect.left, rect.bottom, 180, 190)
      setCtxMenu({ x: pos.x, y: pos.y, fileId, trigger: event.currentTarget })
      return
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextId = getTabNavigationTargetId(
      openFiles,
      fileId,
      event.key as DocumentTabNavigationKey,
    )
    if (!nextId) return
    tabRefs.current[nextId]?.focus()
    onSwitch(nextId)
  }

  if (openFiles.length === 0 && !graphTabOpen) return null

  const canCloseOthers = ctxMenu
    ? openFiles.some((file) => file.pinned !== true && file.id !== ctxMenu.fileId)
    : false
  const canCloseAll = openFiles.some((file) => file.pinned !== true)

  return (
    <>
      <div className="tabbar" role="tablist">
        {openFiles.map((file) => {
          const active = file.id === activeFileId && !graphTabActive
          const dirty = savedMap[file.id] === false
          const preview = file.preview === true
          const pinned = file.pinned === true
          return (
            <div
              key={file.id}
              role="tab"
              ref={(element) => {
                tabRefs.current[file.id] = element
              }}
              aria-selected={active}
              aria-label={`${file.name}${pinned ? '，已固定' : ''}${dirty ? '，未保存' : ''}${preview ? '，预览标签' : ''}`}
              tabIndex={active ? 0 : -1}
              className={`tab ${active ? 'active' : ''} ${preview ? 'preview' : ''} ${overId === file.id && dragId !== null && dragId !== file.id ? 'drag-over' : ''}`}
              draggable
              onDragStart={(e) => {
                setDragId(file.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragId !== null && dragId !== file.id) setOverId(file.id)
              }}
              onDragLeave={() => {
                if (overId === file.id) setOverId(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId !== null && dragId !== file.id) {
                  // D8：起点与落点都按 id 反查当前下标（拖拽期间 openFiles 可能已变化）
                  const from = openFiles.findIndex((f) => f.id === dragId)
                  const to = openFiles.findIndex((f) => f.id === file.id)
                  if (from !== -1 && to !== -1) onReorder(from, to)
                }
                setDragId(null)
                setOverId(null)
              }}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              onClick={() => onSwitch(file.id)}
              // 中键点击关闭（对标浏览器/VS Code 标签页习惯）
              onAuxClick={(e) => {
                if (e.button !== 1) return
                e.preventDefault()
                onClose(file.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const pos = clampMenuPosition(e.clientX, e.clientY, 180, 190)
                setCtxMenu({ x: pos.x, y: pos.y, fileId: file.id, trigger: e.currentTarget })
              }}
              onKeyDown={(event) => handleTabKeyDown(event, file.id)}
              title={preview ? '预览标签：双击左侧文件可固定' : (file.path ?? file.name)}
            >
              {pinned && (
                <svg className="tab-pin" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 17v5M5 17h14M8 3h8l-1 7 3 3H6l3-3z" />
                </svg>
              )}
              <span className="tab-name">{file.name}</span>
              {dirty && <span className="tab-dot" />}
              <button
                type="button"
                className="tab-close"
                aria-label={`关闭 ${file.name}`}
                title="关闭"
                onMouseDown={(event) => event.preventDefault()}
                onKeyDown={(event) => event.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(file.id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}
        {/* 知识图谱内置标签：固定末尾，不参与拖拽/右键菜单/固定 */}
        {graphTabOpen && (
          <div
            role="tab"
            aria-selected={graphTabActive}
            aria-label="知识图谱"
            tabIndex={graphTabActive ? 0 : -1}
            className={`tab graph-tab ${graphTabActive ? 'active' : ''}`}
            onClick={() => onGraphTabSwitch()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onGraphTabSwitch()
              }
            }}
            onAuxClick={(e) => {
              if (e.button !== 1) return
              e.preventDefault()
              onGraphTabClose()
            }}
            title="知识图谱"
          >
            <svg className="tab-graph-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="6" cy="6" r="2.4" />
              <circle cx="18" cy="7" r="2.4" />
              <circle cx="12" cy="17" r="2.4" />
              <path d="M8 7.2l8.2-.5M7.4 8.1l3.4 6.6M16.6 8.8l-3.6 6" />
            </svg>
            <span className="tab-name">知识图谱</span>
            <button
              type="button"
              className="tab-close"
              aria-label="关闭知识图谱标签"
              title="关闭"
              onMouseDown={(event) => event.preventDefault()}
              onKeyDown={(event) => event.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onGraphTabClose()
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {ctxMenu && (
        <TabContextMenu
          state={ctxMenu}
          pinned={openFiles.find((file) => file.id === ctxMenu.fileId)?.pinned === true}
          canCloseOthers={canCloseOthers}
          canCloseAll={canCloseAll}
          onDismiss={dismissTabMenu}
          onTogglePin={onTogglePin}
          onCloseTab={onClose}
          onCloseOthers={onCloseOthers}
          onCloseAll={onCloseAll}
        />
      )}
    </>
  )
}
