import React from 'react'
import { Icon } from './Icon'
import type { DemoNote } from './model'

interface Props {
  note: DemoNote
  editing: boolean
  onEdit: () => void
  onChange: (markdown: string) => void
  onFavorite: () => void
  onLinks: () => void
}

export function NoteContent({ note, editing, onEdit, onChange, onFavorite, onLinks }: Props): JSX.Element {
  let section = 0
  return <>
    <div className="pathbar">
      <span aria-label="当前文档路径">{note.folder} / {note.title}.md</span>
      <button onClick={onEdit} aria-label={editing ? '完成编辑' : '编辑演示文档'}>{editing ? '完成编辑' : '编辑'}</button>
    </div>
    <div className="paper-scroll" key={note.id}>
      <article className="paper" id="document" tabIndex={-1}>
        <div className="paper-meta"><span>{note.folder}</span>
          <button className="icon-button" onClick={onFavorite} aria-label={note.favorite ? '取消收藏' : '收藏文档'} aria-pressed={note.favorite} title={note.favorite ? '取消收藏' : '收藏文档'}><Icon name="star" /></button>
        </div>
        {editing ? <><label className="edit-label" htmlFor="demo-editor">演示正文 · Markdown</label><textarea id="demo-editor" aria-label="演示正文" autoFocus maxLength={50000} value={note.markdown} onChange={event => onChange(event.target.value)} /></> :
          <div className="prose">{note.markdown.split('\n\n').map((block, index) => {
            // 仅演示受限文本排版，React 转义所有输入；正式版继续使用 Milkdown。
            if (block.startsWith('# ')) return <h1 key={index}>{block.slice(2)}</h1>
            if (block.startsWith('## ')) return <h2 id={`section-${section++}`} tabIndex={-1} key={index}>{block.slice(3)}</h2>
            if (block.startsWith('> ')) return <blockquote key={index}>{block.slice(2)}</blockquote>
            if (block.startsWith('- ')) return <ul key={index}>{block.split('\n').map((line, item) => <li key={item}>{line.replace(/^- /, '')}</li>)}</ul>
            return <p key={index}>{block}</p>
          })}</div>}
        <div className="paper-footer"><Icon name="link-simple" /><button onClick={onLinks}>沿着这篇笔记，继续思考<span>{note.related.length} 篇关联</span></button></div>
      </article>
    </div>
  </>
}
