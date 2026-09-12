import React, { useEffect, useRef, useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { Inspector } from './Inspector'
import { Navigation } from './Navigation'
import { NoteContent } from './NoteContent'
import { sampleNotes } from './model'
import { useDrawerFocus } from './useDrawerFocus'
import type { Collection, Overlay, Panel } from './model'

interface Layout {
  focus: boolean
  sidebar: boolean
  panel: Panel | null
  dark: boolean
  overlay: Overlay
}

export function Workbench(): JSX.Element {
  const [notes, setNotes] = useState(sampleNotes)
  const [activeId, setActiveId] = useState('thinking')
  const [tabs, setTabs] = useState(['thinking', 'reading'])
  const [recent, setRecent] = useState(['thinking', 'reading'])
  const [collection, setCollection] = useState<Collection>('all')
  const [editing, setEditing] = useState(false)
  const [layout, setLayout] = useState<Layout>({ focus: false, sidebar: true, panel: null, dark: false, overlay: null })
  const focusTrigger = useRef<HTMLButtonElement>(null)
  const panelTrigger = useRef<HTMLButtonElement>(null)
  const sidebarTrigger = useRef<HTMLButtonElement>(null)
  const note = notes.find(item => item.id === activeId) || notes[0]
  const sidebarVisible = layout.sidebar && !layout.focus
  const panelVisible = layout.panel !== null && !layout.focus
  useDrawerFocus(sidebarVisible, panelVisible)

  useEffect(() => {
    document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activeId])

  const handleOpen = (id: string): void => {
    setActiveId(id)
    setTabs(prev => prev.includes(id) ? prev : [...prev, id])
    setRecent(prev => [id, ...prev.filter(item => item !== id)])
    setEditing(false)
    if (window.innerWidth <= 820) setLayout(prev => ({ ...prev, sidebar: false, panel: null }))
  }
  const handlePanel = (panel: Panel): void => setLayout(prev => ({ ...prev, panel, focus: false, ...(window.innerWidth <= 820 ? { sidebar: false } : {}) }))
  const handleClosePanel = (): void => { setLayout(prev => ({ ...prev, panel: null })); panelTrigger.current?.focus() }
  const handleCloseSidebar = (): void => { setLayout(prev => ({ ...prev, sidebar: false })); sidebarTrigger.current?.focus() }
  const handleNew = (): void => {
    const number = notes.filter(item => item.id.startsWith('new-')).length + 1
    const id = `new-${number}`
    setNotes(prev => [...prev, { id, title: `未命名笔记 ${number}`, folder: '随笔', markdown: `# 未命名笔记 ${number}\n\n从一个想法开始。`, related: [], favorite: false }])
    handleOpen(id)
    setEditing(true)
    setCollection('all')
  }
  const handleExitFocus = (): void => { setLayout(prev => ({ ...prev, focus: false })); focusTrigger.current?.focus() }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing || event.keyCode === 229) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setLayout(prev => ({ ...prev, overlay: 'search' }))
      }
      if (event.key === 'Escape') {
        setLayout(prev => {
          if (prev.overlay) return { ...prev, overlay: null }
          if (prev.focus) { focusTrigger.current?.focus(); return { ...prev, focus: false } }
          if (prev.panel) { panelTrigger.current?.focus(); return { ...prev, panel: null } }
          if (window.innerWidth <= 820 && prev.sidebar) { sidebarTrigger.current?.focus(); return { ...prev, sidebar: false } }
          return prev
        })
      }
    }
    // 窄窗只是原型展示策略，不写入生产布局偏好。
    const handleResize = (): void => { if (window.innerWidth <= 820) setLayout(prev => ({ ...prev, sidebar: false, panel: null })) }
    handleResize()
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('resize', handleResize) }
  }, [])

  return <div className={`workbench ${sidebarVisible ? 'has-sidebar' : ''} ${panelVisible ? 'has-panel' : ''} ${layout.focus ? 'is-focused' : ''}`} data-theme={layout.dark ? 'night' : 'mist'}>
    <a className="skip-link" href="#document">跳到正文</a>
    {sidebarVisible && <Navigation notes={notes} activeId={activeId} collection={collection} recent={recent} onCollection={setCollection} onOpen={handleOpen} onNew={handleNew} onClose={handleCloseSidebar} onSearch={() => setLayout(prev => ({ ...prev, overlay: 'search' }))} onSettings={() => setLayout(prev => ({ ...prev, overlay: 'settings' }))} />}
    {(sidebarVisible || panelVisible) && <button className="drawer-scrim" aria-label="关闭侧面板" onClick={() => { handleClosePanel(); handleCloseSidebar() }} />}
    <section className="main-shell" aria-label="写作工作台">
      <header className="topbar">
        <button ref={sidebarTrigger} className={`icon-button restore-nav ${sidebarVisible ? 'nav-open' : ''}`} aria-label="展开导航" title="展开导航" onClick={() => setLayout(prev => ({ ...prev, sidebar: true, focus: false, ...(window.innerWidth <= 820 ? { panel: null } : {}) }))}><Icon name="sidebar-simple" /></button>
        {!sidebarVisible && <span className="collapsed-vault">我的知识库</span>}
        <div className="tabs" role="tablist" aria-label="打开的文档" onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
          if (!offset && event.key !== 'Home' && event.key !== 'End') return
          event.preventDefault()
          const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(activeId) + offset + tabs.length) % tabs.length
          handleOpen(tabs[index])
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus()
        }}>{tabs.map(id => {
          const item = notes.find(value => value.id === id)
          if (!item) return null
          return <button key={id} role="tab" tabIndex={id === activeId ? 0 : -1} aria-selected={id === activeId} aria-label={`${item.title}${item.edited ? ' · 本次有修改' : ''}`} title={item.title} className={id === activeId ? 'active' : ''} onClick={() => handleOpen(id)}><Icon name="file-text" /><span>{item.title}</span>{item.edited && <span className="edit-mark">●</span>}</button>
        })}</div>
        <div className="top-actions"><button ref={focusTrigger} className="focus-button" aria-label={layout.focus ? '退出专注' : '专注'} title={layout.focus ? '退出专注' : '专注'} aria-pressed={layout.focus} onClick={() => layout.focus ? handleExitFocus() : setLayout(prev => ({ ...prev, focus: true }))}><Icon name="arrows-out-simple" /><span>{layout.focus ? '退出专注' : '专注'}</span></button><button ref={panelTrigger} className="icon-button" title="大纲、关联与 AI" aria-label="打开文档辅助" aria-expanded={panelVisible} onClick={() => panelVisible ? handleClosePanel() : handlePanel('outline')}><Icon name="sidebar-simple" /></button><button className="icon-button" aria-label="更多文档操作" title="更多文档操作" onClick={() => setLayout(prev => ({ ...prev, overlay: 'more' }))}><Icon name="dots-three" /></button></div>
      </header>
      <main className="document-area"><NoteContent note={note} editing={editing} onEdit={() => setEditing(prev => !prev)} onChange={markdown => setNotes(prev => prev.map(item => item.id === activeId ? { ...item, markdown, edited: true } : item))} onFavorite={() => setNotes(prev => prev.map(item => item.id === activeId ? { ...item, favorite: !item.favorite } : item))} onLinks={() => handlePanel('links')} /></main>
      <footer className="statusbar"><span role="status">演示空间 · 修改仅本次保留</span><span>{note.edited ? '本次有修改' : '示例文档'}<span className="status-divider">·</span>{note.markdown.replace(/\s/g, '').length} 字符</span></footer>
    </section>
    {panelVisible && layout.panel && <Inspector panel={layout.panel} note={note} notes={notes} onPanel={handlePanel} onOpen={handleOpen} onClose={handleClosePanel} />}
    {layout.overlay && <Dialog overlay={layout.overlay} notes={notes} dark={layout.dark} onTheme={() => setLayout(prev => ({ ...prev, dark: !prev.dark }))} onOpen={handleOpen} onClose={() => setLayout(prev => ({ ...prev, overlay: null }))} onPanel={() => handlePanel('outline')} />}
  </div>
}
