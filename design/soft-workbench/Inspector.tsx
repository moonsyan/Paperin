import React from 'react'
import { Icon } from './Icon'
import { headings } from './model'
import type { DemoNote, Panel } from './model'

interface Props {
  panel: Panel
  note: DemoNote
  notes: DemoNote[]
  onPanel: (panel: Panel) => void
  onOpen: (id: string) => void
  onClose: () => void
}

export function Inspector({ panel, note, notes, onPanel, onOpen, onClose }: Props): JSX.Element {
  const related = notes.filter(item => note.related.includes(item.id))
  return <aside className="inspector" aria-label="文档辅助">
    <div className="inspector-heading"><div className="panel-options">{([['outline', '大纲'], ['links', '关联'], ['ai', 'AI']] as const).map(([id, label]) => <button key={id} onClick={() => onPanel(id)} aria-pressed={panel === id}>{label}</button>)}</div><button className="icon-button" onClick={onClose} aria-label="关闭文档辅助"><Icon name="x" /></button></div>
    {panel === 'outline' && <div className="panel-body"><p className="section-label">此页目录</p><nav className="outline" aria-label="文档大纲">{headings(note.markdown).map((heading, index) => <a key={index} href={`#section-${index}`} onClick={() => document.getElementById(`section-${index}`)?.focus()}>{heading}</a>)}</nav>{headings(note.markdown).length === 0 && <p className="muted">添加二级标题后显示目录。</p>}<div className="panel-separator" /><button className="subtle-link" onClick={() => onPanel('links')}><Icon name="link-simple" />查看 {related.length} 篇关联笔记</button></div>}
    {panel === 'links' && <div className="panel-body"><p className="section-label">从这里接着想</p><p className="muted">与当前文档相连的笔记。</p>{related.map(item => <button className="related-note" key={item.id} onClick={() => onOpen(item.id)}><span>{item.folder}</span><strong>{item.title}</strong><Icon name="arrow-up-right" /></button>)}{related.length === 0 && <p>还没有关联笔记。</p>}<p className="panel-footnote">当前展示的是演示笔记之间的预设关联。</p></div>}
    {panel === 'ai' && <div className="panel-body"><div className="concept-label">AI 概念预览</div><h2>先从自己的资料里找</h2><p className="muted">交互示例，未连接模型；不会发送任何内容。</p><div className="ai-question">这篇笔记可以怎样继续写？</div><p className="section-label">可核对的参考内容</p><blockquote className="source-excerpt">{note.markdown.split('\n\n')[1] || '当前笔记还没有正文。'}</blockquote><p className="ai-explanation">正式版的回答应引用具体笔记与段落。先核对来源，再决定是否插入正文。</p><button className="related-note" onClick={() => onOpen(note.id)}><span>来源 · 当前演示笔记</span><strong>{note.title}</strong><Icon name="arrow-up-right" /></button><div className="panel-separator" /><p className="panel-footnote">产品方向：选择资料范围 → 查看带来源的建议 → 预览差异 → 手动插入。云端模型需要单独确认发送范围。</p></div>}
  </aside>
}
