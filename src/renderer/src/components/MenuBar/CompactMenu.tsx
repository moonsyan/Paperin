import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { OPERATION_GROUPS, QUICK_ACTIONS, operationItems } from './compact-menu-model'
import type { OperationGroup } from './compact-menu-model'
import type { ShortcutMap } from '../../data/shortcuts'
import type { CSSProperties, KeyboardEvent } from 'react'
import './compact-menu.css'

interface CompactMenuProps {
  onAction: (action: string) => void
  shortcuts: ShortcutMap
  isActionEnabled?: (action: string) => boolean
}

export function CompactMenu({ onAction, shortcuts, isActionEnabled }: CompactMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState<OperationGroup[]>([])
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<CSSProperties>({})
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const returnLabel = useRef<string | null>(null)
  const items = useMemo(() => operationItems(shortcuts), [shortcuts])
  const current = path[path.length - 1]
  const atHome = !current && !searching

  const handleClose = (restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }
  const handleOpen = () => {
    setPath([])
    setSearching(false)
    setQuery('')
    returnLabel.current = null
    setOpen(true)
  }
  const handleBack = () => {
    returnLabel.current = searching ? '搜索全部操作' : current?.label ?? null
    if (searching) { setSearching(false); setQuery('') }
    else setPath((previous) => previous.slice(0, -1))
  }
  const handleAction = (action: string) => {
    if (isActionEnabled && !isActionEnabled(action)) return
    handleClose()
    onAction(action)
  }

  useEffect(() => {
    if (!open) return
    const handleOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const handlePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect()
      if (!trigger) return
      const width = Math.min(300, window.innerWidth - 16)
      setPosition({
        position: 'fixed', width,
        left: Math.max(8, Math.min(trigger.left, window.innerWidth - width - 8)),
        top: trigger.bottom + 6,
        maxHeight: Math.max(80, window.innerHeight - trigger.bottom - 14),
      })
    }
    handlePosition()
    window.addEventListener('resize', handlePosition)
    return () => window.removeEventListener('resize', handlePosition)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const target = returnLabel.current
      ? Array.from(panel?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        .find((button) => button.getAttribute('aria-label') === returnLabel.current)
      : null
    ;(target ?? panel?.querySelector<HTMLElement>('input') ?? panel?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus()
    returnLabel.current = null
  }, [open, current, searching])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    const inInput = event.target instanceof HTMLInputElement
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (atHome) handleClose()
      else handleBack()
      return
    }
    if (event.key === 'ArrowLeft' && !inInput && !atHome) {
      event.preventDefault()
      handleBack()
      return
    }
    if (inInput && event.key !== 'ArrowDown') return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
    const index = buttons.findIndex((button) => button === document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
  const renderAction = (action: string, quick = false) => {
    const item = items.find((entry) => entry.action === action)
    if (!item) return null
    const label = quick ? ({ new: '新建', open: '打开', save: '保存' }[action] ?? item.label) : item.label
    return (
      <button type="button" key={action} className={quick ? 'operation-quick' : 'operation-row'}
        aria-label={item.label} disabled={isActionEnabled ? !isActionEnabled(action) : false}
        onClick={() => handleAction(action)}>
        <span>{label}</span>{item.shortcut && <small>{item.shortcut}</small>}
      </button>
    )
  }
  const renderGroup = (group: OperationGroup) => (
    <button type="button" key={group.id} className="operation-row" aria-label={group.label}
      onClick={() => setPath((previous) => [...previous, group])}>
      <span>{group.label}</span><span className="operation-chevron" aria-hidden="true">›</span>
    </button>
  )
  const results = query.trim() ? items.filter((item) => item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : []

  return (
    <div className="menubar" ref={rootRef} onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
    }}>
      <button type="button" ref={triggerRef} className={`menu-item menu-item-more ${open ? 'open' : ''}`}
        aria-label="更多菜单" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => open ? handleClose() : handleOpen()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); handleOpen() }
        }}>更多…</button>
      {open && (
        <div ref={panelRef} className="operation-panel" role="dialog" aria-label="更多操作"
          style={position} onKeyDown={handleKeyDown}>
          {atHome ? (
            <>
              <div className="operation-heading">常用操作</div>
              <div className="operation-shortcuts">{QUICK_ACTIONS.map((action) => renderAction(action, true))}</div>
              <div className="operation-groups">{OPERATION_GROUPS.map(renderGroup)}</div>
              <div className="operation-footer">
                <button type="button" className="operation-row" aria-label="搜索全部操作"
                  onClick={() => setSearching(true)}>搜索全部操作
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" />
                  </svg>
                </button>
                {renderAction('settings')}
              </div>
            </>
          ) : (
            <>
              <div className="operation-page-heading">
                <button type="button" className="operation-back" aria-label="返回更多操作" onClick={handleBack}>‹ 返回</button>
                <strong>{searching ? '搜索全部操作' : current?.label}</strong>
              </div>
              {searching ? (
                <>
                  <input aria-label="搜索菜单命令" placeholder="输入操作名称…" type="search"
                    value={query} onChange={(event) => setQuery(event.target.value)} />
                  {results.map((item) => item.action ? renderAction(item.action) : null)}
                  {results.length === 0 && <p className="operation-empty">{query.trim() ? '没有匹配的操作' : '搜索所有分类中的操作'}</p>}
                </>
              ) : (
                <>{current?.actions.map((action) => renderAction(action))}{current?.children?.map(renderGroup)}</>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
