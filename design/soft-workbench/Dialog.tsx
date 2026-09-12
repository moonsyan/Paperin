import React, { useEffect, useRef, useState } from 'react'
import planUrl from '../../docs/SOFT-WORKBENCH-PLAN.md?url'
import { Icon } from './Icon'
import { findNotes } from './model'
import type { DemoNote, Overlay } from './model'

interface Props {
  overlay: Exclude<Overlay, null>
  notes: DemoNote[]
  dark: boolean
  onTheme: () => void
  onOpen: (id: string) => void
  onClose: () => void
  onPanel: () => void
}

export function Dialog({ overlay, notes, dark, onTheme, onOpen, onClose, onPanel }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const results = findNotes(notes, query)
  useEffect(() => {
    const trigger = document.activeElement
    const initial = ref.current?.querySelector<HTMLElement>('input') || ref.current?.querySelector<HTMLElement>('button')
    initial?.focus()
    return () => { if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus() }
  }, [])
  const title = overlay === 'search' ? '搜索文档' : overlay === 'settings' ? '外观与说明' : '文档操作'
  return <div className="modal-scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className={`dialog ${overlay}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
      if (event.key === 'Tab') {
        const controls = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,a[href]') || [])
        const first = controls[0], last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }}>
      <div className="dialog-heading"><h2 id="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭弹窗"><Icon name="x" /></button></div>
      {overlay === 'search' && <>
        <div className="search-input"><Icon name="magnifying-glass" /><input type="search" aria-label="搜索笔记标题与内容" placeholder="搜索笔记标题与内容…" value={query} maxLength={128} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          if (event.key === 'ArrowDown') { event.preventDefault(); ref.current?.querySelector<HTMLElement>('.search-result')?.focus() }
          if (event.key === 'Enter' && results[0]) { onOpen(results[0].id); onClose() }
        }} /></div>
        <p className="result-count" role="status">{results.length ? `${results.length} 篇笔记 · 演示知识库` : '没有找到匹配的笔记'}</p>
        <div className="search-results">{results.map(note => <button className="search-result" key={note.id} onClick={() => { onOpen(note.id); onClose() }}><Icon name="file-text" /><span><strong>{note.title}</strong><small>{note.folder} / {note.title}.md</small></span><Icon name="arrow-right" /></button>)}</div>
        {results.length === 0 && <p className="empty-search">试试更短的关键词，例如“思考”或“阅读”。</p>}
        <div className="dialog-footer">Enter 打开首项 · ↓ 移到结果 · Tab 浏览 · Esc 返回</div>
      </>}
      {overlay === 'settings' && <div className="dialog-content"><p>柔和的底色，清楚的文字。</p><button className="setting-row" onClick={onTheme}><span><Icon name={dark ? 'sun' : 'moon'} />{dark ? '切换为雾白' : '切换为夜松'}</span><span>当前：{dark ? '夜松' : '雾白'}</span></button><div className="panel-separator" /><h3>关于这个原型</h3><p>这是独立的设计演示，包含五篇合成笔记。编辑、收藏和新建仅保留在本次页面会话，刷新后恢复样本。</p><p>现阶段免费、本地优先。AI 仅展示可核对来源的交互方向，同步与在线发布尚未接入。</p><a href={planUrl} target="_blank" rel="noreferrer">阅读完整定位与重构规划 <Icon name="arrow-up-right" /></a></div>}
      {overlay === 'more' && <div className="dialog-content"><button className="menu-action" onClick={() => { onPanel(); onClose() }}><Icon name="list" />大纲、关联与 AI</button><h3>正式版保留的操作</h3><p>保存、另存为、重命名、移动、版本历史和导出沿用现有命令。本原型不读写实际文件。</p><h3>发布方向</h3><p>先打磨现有文件导出，再验证文章预览、附件检查与单篇发布。上线前明确公开范围，并支持撤回。</p><div className="concept-label">在线发布尚未接入</div></div>}
    </div>
  </div>
}
