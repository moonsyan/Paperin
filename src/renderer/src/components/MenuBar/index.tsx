import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { CompactMenu } from './CompactMenu'
import { buildMenus, MENU_LABELS } from './menu-definitions'
import type { MenuItemDef } from './menu-definitions'
import type { ShortcutMap } from '../../data/shortcuts'

/** 最近打开的磁盘文件 */
export interface RecentFile {
  path: string
  name: string
}

interface MenuBarProps {
  onAction: (action: string) => void
  /** 最近打开的文件（渲染在文件菜单内） */
  recentFiles?: RecentFile[]
  /** 当前快捷键映射（设置中可自定义）：菜单标签随之更新，与帮助面板同源 */
  shortcuts: ShortcutMap
  /**
   * 动作可用性：命令注册表按 scope + CommandContext 判断，不可用的低频能力
   * （没有知识库时的知识图谱、工作区全文搜索等）在菜单里直接灰显。
   * 未登记的动作（编辑器命令、openRecent:* 等）由调用方返回 true。
   */
  isActionEnabled?: (action: string) => boolean
  /** 紧凑模式按任务分层展示原有动作，最近文件交给导航与快速打开。 */
  compact?: boolean
}

export function MenuBar(props: MenuBarProps): JSX.Element {
  return props.compact ? <CompactMenu {...props} /> : <LegacyMenuBar {...props} />
}

function LegacyMenuBar({ onAction, recentFiles = [], shortcuts, isActionEnabled }: MenuBarProps): JSX.Element {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [ddStyle, setDdStyle] = useState<CSSProperties>({})
  const barRef = useRef<HTMLDivElement>(null)
  /** D2：当前菜单是否由点击打开（悬停打开的菜单，点击标题=钉住而非关闭） */
  const openByClickRef = useRef(false)
  /** D3：当前打开菜单的触发按钮（窗口尺寸变化时按新位置重算下拉坐标） */
  const triggerRef = useRef<HTMLElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  /** 键盘打开菜单后待移入下拉的焦点位置（下拉渲染完成后在 effect 中执行） */
  const pendingDropdownFocusRef = useRef<'first' | 'last' | null>(null)

  const menus = useMemo(() => buildMenus(shortcuts, recentFiles), [recentFiles, shortcuts])

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenKey(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Esc 关闭（菜单未打开时直接跳过，避免编辑器每次按键都走无效路径）；
  // 焦点在下拉项上时把焦点还给触发按钮，避免回落到 body 使键盘失灵
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || openKey === null) return
      const active = document.activeElement
      const focusInsideDropdown =
        active instanceof HTMLElement && dropdownRef.current?.contains(active)
      setOpenKey(null)
      if (focusInsideDropdown) triggerRef.current?.focus()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [openKey])

  // 键盘打开菜单后把焦点移入下拉首/末项（下拉条件渲染完成在此时机生效）；
  // 标记取出后立即清空，菜单经任意路径关闭后不留残留，避免下次
  // 悬停/点击打开菜单时焦点被意外劫持进下拉
  useEffect(() => {
    const where = pendingDropdownFocusRef.current
    pendingDropdownFocusRef.current = null
    if (!openKey || !where) return
    const items = dropdownRef.current?.querySelectorAll<HTMLButtonElement>('.dd-item:not([disabled])')
    if (!items || items.length === 0) return
    ;(where === 'first' ? items[0] : items[items.length - 1]).focus()
  }, [openKey])

  // D3：窗口尺寸变化时按触发按钮的新位置重算下拉坐标
  // （fixed 定位不随窗口移动，不重算会悬在旧位置）
  useEffect(() => {
    if (!openKey) return
    const recompute = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      setDdStyle({ position: 'fixed', top: rect.bottom + 4, left: rect.left })
    }
    window.addEventListener('resize', recompute)
    return () => window.removeEventListener('resize', recompute)
  }, [openKey])

  const handleItemClick = useCallback(
    (key: string, item: MenuItemDef) => {
      // 不可用动作在渲染层已禁用；这里再挡一次，避免键盘路径绕过 disabled
      if (item.action && isActionEnabled && !isActionEnabled(item.action)) return
      // 下拉即将卸载：先把焦点交还触发按钮，避免焦点回落到 body
      triggerRef.current?.focus()
      setOpenKey(null)
      if (item.action) onAction(item.action)
    },
    [isActionEnabled, onAction],
  )

  /** 菜单条目是否可用：无 action（纯展示/分隔）恒为真 */
  const isItemEnabled = useCallback(
    (item: MenuItemDef) => !item.action || !isActionEnabled || isActionEnabled(item.action),
    [isActionEnabled],
  )

  /** 打开菜单时计算下拉位置（fixed 定位，避免被 workspace overflow 裁剪） */
  const openMenu = useCallback((key: string, trigger: HTMLElement, byClick = false) => {
    triggerRef.current = trigger
    const rect = trigger.getBoundingClientRect()
    setDdStyle({ position: 'fixed', top: rect.bottom + 4, left: rect.left })
    openByClickRef.current = byClick
    setOpenKey(key)
  }, [])

  const handleMenuKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: string,
  ) => {
    if (event.key === 'Escape') {
      setOpenKey(null)
      return
    }
    // 按住 Enter/空格的系统按键重复会在开/关间高频切换，直接忽略
    if (event.repeat) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const wantFirst = event.key === 'ArrowDown'
      if (openKey === key) {
        // 已打开（下拉已渲染）：直接聚焦首/末项
        const items = dropdownRef.current?.querySelectorAll<HTMLButtonElement>('.dd-item:not([disabled])')
        if (items && items.length > 0) {
          ;(wantFirst ? items[0] : items[items.length - 1]).focus()
        }
        return
      }
      // 刚打开：记录待聚焦位置，渲染完成后由 openKey effect 接管
      pendingDropdownFocusRef.current = wantFirst ? 'first' : 'last'
      openMenu(key, event.currentTarget, true)
      return
    }
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    if (openKey === key) {
      // 与 D2 点击语义对齐：悬停打开的菜单 Enter/空格=钉住（保持打开）；
      // 键盘/点击打开的再按=关闭
      if (!openByClickRef.current) {
        openByClickRef.current = true
        return
      }
      setOpenKey(null)
      return
    }
    openMenu(key, event.currentTarget, true)
  }

  /** 下拉内方向键/Home/End 导航与 Esc 关闭（role="menu" 的键盘可达性） */
  const handleDropdownKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpenKey(null)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      // WAI-ARIA menu 模式：Tab 离开菜单时应关闭；焦点交给默认 Tab 顺序
      setOpenKey(null)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('.dd-item:not([disabled])'),
    )
    if (items.length === 0) return
    const currentIndex = items.findIndex((el) => el === document.activeElement)
    let nextIndex: number
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = items.length - 1
    else if (event.key === 'ArrowDown')
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
    else nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
    items[nextIndex]?.focus()
  }

  const renderMenuItems = (key: string): JSX.Element[] => menus[key].map((item, i) =>
    item.separator ? (
      <div key={`${key}-sep-${i}`} className="dd-sep" />
    ) : (
      <button
        type="button"
        key={`${key}-item-${i}`}
        className={`dd-item ${isItemEnabled(item) ? '' : 'is-disabled'}`}
        role="menuitem"
        disabled={!isItemEnabled(item)}
        aria-disabled={isItemEnabled(item) ? undefined : true}
        onClick={() => handleItemClick(key, item)}
      >
        <span className="dd-label">{item.label}</span>
        {item.shortcut && <span className="sc">{item.shortcut}</span>}
      </button>
    ),
  )

  return (
    <div className="menubar" ref={barRef}>
      {Object.keys(menus).map((key) => (
        <div
          key={key}
          className="menu-entry"
          onMouseEnter={(event) => {
            const trigger = event.currentTarget.querySelector('button')
            if (trigger) openMenu(key, trigger)
          }}
        >
          <button
            type="button"
            className={`menu-item ${openKey === key ? 'open' : ''}`}
            aria-expanded={openKey === key}
            aria-haspopup="menu"
            onClick={(event) => {
              if (openKey === key) {
                // D2：悬停打开的菜单，点击标题=钉住（保持打开）；
                // 点击打开的菜单，再点=关闭
                if (openByClickRef.current) setOpenKey(null)
              } else {
                openMenu(key, event.currentTarget, true)
              }
            }}
            onKeyDown={(event) => handleMenuKeyDown(event, key)}
          >
          {MENU_LABELS[key]}
          </button>
          {openKey === key && (
            <div
              className="dropdown show"
              style={ddStyle}
              role="menu"
              ref={dropdownRef}
              onKeyDown={handleDropdownKeyDown}
            >
            {renderMenuItems(key)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
