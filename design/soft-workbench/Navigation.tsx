import React, { useState } from 'react'
import logo from '../../resources/icon.png'
import { Icon } from './Icon'
import type { Collection, DemoNote } from './model'

interface Props {
  notes: DemoNote[]
  activeId: string
  collection: Collection
  recent: string[]
  onCollection: (collection: Collection) => void
  onOpen: (id: string) => void
  onSearch: () => void
  onNew: () => void
  onSettings: () => void
  onClose: () => void
}

export function Navigation(props: Props): JSX.Element {
  const [closed, setClosed] = useState<string[]>([])
  const visible = props.collection === 'favorites' ? props.notes.filter(note => note.favorite)
    : props.collection === 'recent' ? props.recent.flatMap(id => props.notes.filter(note => note.id === id)) : props.notes
  const groups = props.collection === 'all' ? [...new Set(visible.map(note => note.folder))] : ['']
  return <aside className="navigation" aria-label="知识库导航">
    <div className="brand-row"><img src={logo} alt="" /><strong>LastFileHome</strong><button className="icon-button" onClick={props.onClose} aria-label="收起导航" title="收起导航"><Icon name="sidebar-simple" /></button></div>
    <div className="vault-name">我的知识库<span>本地</span></div>
    <button className="search-trigger" onClick={props.onSearch} aria-label="搜索文档"><Icon name="magnifying-glass" /><span>搜索文档</span><kbd>Ctrl P</kbd></button>
    <nav className="collections" aria-label="快捷导航">
      <button aria-pressed={props.collection === 'recent'} onClick={() => props.onCollection('recent')}><Icon name="clock" />最近编辑</button>
      <button aria-pressed={props.collection === 'favorites'} onClick={() => props.onCollection('favorites')}><Icon name="star" />我的收藏</button>
    </nav>
    <div className="collection-heading"><button onClick={() => props.onCollection('all')} aria-pressed={props.collection === 'all'}>全部笔记</button><button className="icon-button" onClick={props.onNew} aria-label="新建演示笔记" title="新建演示笔记"><Icon name="plus" /></button></div>
    <nav className="note-list" aria-label="笔记列表">
      {visible.length === 0 && <p className="empty-small">还没有收藏，打开文档后点击星标即可加入。</p>}
      {groups.map(group => <div className="folder" key={group}>
        {group && <button className="folder-toggle" aria-expanded={!closed.includes(group)} onClick={() => setClosed(prev => prev.includes(group) ? prev.filter(item => item !== group) : [...prev, group])}><Icon name={closed.includes(group) ? 'caret-right' : 'caret-down'} />{group}</button>}
        {!closed.includes(group) && visible.filter(note => !group || note.folder === group).map(note => <button key={note.id} className={`note-row ${props.activeId === note.id ? 'selected' : ''}`} onClick={() => props.onOpen(note.id)} aria-current={props.activeId === note.id ? 'page' : undefined} title={note.title} aria-label={note.title}><Icon name="file-text" /><span>{note.title}</span>{note.edited && <span className="edit-mark" aria-label="本次有修改">●</span>}</button>)}
      </div>)}
    </nav>
    <div className="nav-footer"><span>文件在手边，想法有归处。</span><button onClick={props.onSettings}><Icon name="gear-six" />外观与说明</button></div>
  </aside>
}
