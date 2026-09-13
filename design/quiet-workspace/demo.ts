type BlockKind = 'p' | 'h2' | 'quote' | 'task'
interface Block { kind: BlockKind; text: string; checked?: boolean }
interface DemoDocument {
  id: string
  title: string
  subtitle: string
  group: string
  category: string
  favorite: boolean
  blocks: Block[]
}
interface Preferences { theme: 'light' | 'dark' | 'system'; font: 'sans' | 'serif'; size: number }
interface DemoState { documents: DemoDocument[]; activeId: string; tabs: string[]; preferences: Preferences }
interface SearchResult { title: string; description: string; icon: string; run: () => void }

const STORAGE_KEY = 'paperin-quiet-demo-v1'
const seedDocuments: DemoDocument[] = [
  {
    id: 'space', title: '给思考，留一点空白', subtitle: '整理思绪，也整理生活。', group: '随笔与思考', category: '随笔', favorite: true,
    blocks: [
      { kind: 'p', text: '我们每天收集很多东西：读到一半的文章、忽然冒出的灵感，还有想留给未来自己的几句话。但记录的意义，也许不只是把它们存下来。' },
      { kind: 'p', text: '有时候，我们需要的只是一张安静的书桌，让一个尚未成形的想法，慢慢找到自己的轮廓。' },
      { kind: 'h2', text: '让注意力回到文字' },
      { kind: 'p', text: '打开一篇笔记，不必先决定它属于哪个系统，也不必急着给它贴上标签。先写下第一句话，剩下的可以以后再说。' },
      { kind: 'quote', text: '好的工具，应该在需要的时候恰好出现，在思考的时候安静退后。' },
      { kind: 'h2', text: '建立自己的写作节奏' },
      { kind: 'p', text: '比起完整的方法，我更愿意从几个小习惯开始。让写作成为日常，而不是一件需要认真准备的大事。' },
      { kind: 'task', text: '给今天最想记录的事情，写一个标题', checked: true },
      { kind: 'task', text: '留出一段不被消息打断的时间', checked: false },
      { kind: 'task', text: '结束前，给明天的自己留一个问题', checked: false },
      { kind: 'h2', text: '不急着填满每一处空白' },
      { kind: 'p', text: '空白不是遗漏。它是两段文字之间的一次呼吸，也是重新理解一件事的余地。不必把每个想法都整理得井井有条，重要的东西会慢慢浮现。' },
      { kind: 'p', text: '今天就写到这里。把还没有答案的问题留着，让生活继续给出新的线索。' },
    ],
  },
  {
    id: 'weekly', title: '一周灵感摘录', subtitle: '把散落的片刻，慢慢串起来。', group: '随笔与思考', category: '摘录', favorite: true,
    blocks: [
      { kind: 'p', text: '这一周没有什么特别的大事，但一些微小的瞬间，值得单独留下一页。' },
      { kind: 'h2', text: '在通勤路上' },
      { kind: 'p', text: '试着少听十分钟播客，看一看路边正在变化的树。秋天不是突然到来的，是某一片叶子先变了颜色。' },
      { kind: 'quote', text: '灵感不总是在忙着寻找的时候出现。' },
      { kind: 'h2', text: '从一本书开始' },
      { kind: 'p', text: '读完一章以后，不急着抄下漂亮的句子。先合上书，记住它改变了自己的哪个想法。' },
      { kind: 'h2', text: '下周想试试' },
      { kind: 'task', text: '带着相机走一条没有走过的路', checked: false },
      { kind: 'task', text: '把一篇旧笔记重新读一遍', checked: true },
      { kind: 'task', text: '写完那封一直没有寄出的信', checked: false },
    ],
  },
  {
    id: 'walk', title: '散步时想到的事', subtitle: '走慢一点，想法就会追上来。', group: '随笔与思考', category: '日常', favorite: false,
    blocks: [
      { kind: 'p', text: '傍晚沿着河边走了一会儿，没有目的地，也没有记录步数。' },
      { kind: 'h2', text: '一条熟悉的路' },
      { kind: 'p', text: '走过很多遍的街道，换一个时间来，好像又有了新的样子。有人收起摊位，有人在等一杯咖啡，窗里的灯一盏盏亮起来。' },
      { kind: 'quote', text: '把问题带出去走一走，回来时它也许就变轻了。' },
      { kind: 'h2', text: '值得记住的小事' },
      { kind: 'p', text: '不是每一天都需要一个结论。认真地看见一些东西，也算是度过了很好的一天。' },
    ],
  },
  {
    id: 'project', title: '一个小产品的开始', subtitle: '先解决一个具体的问题。', group: '项目手记', category: '项目', favorite: false,
    blocks: [
      { kind: 'p', text: '想做一个自己每天都愿意打开的写作工具。它应该足够简单，又能在需要的时候帮上一点忙。' },
      { kind: 'h2', text: '最初的想法' },
      { kind: 'p', text: '保留本地文件的自由，把编辑和阅读做好。减少一些选择，让写下一句话成为最容易发生的事。' },
      { kind: 'h2', text: '这一阶段' },
      { kind: 'task', text: '确定写作页面的视觉方向', checked: true },
      { kind: 'task', text: '邀请几位朋友试用', checked: false },
      { kind: 'task', text: '记录实际使用中遇到的问题', checked: false },
      { kind: 'h2', text: '留到以后' },
      { kind: 'p', text: '新功能可以慢一点。先让那些已经存在的功能，更可靠、更顺手。' },
    ],
  },
]

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`缺少演示元素：${id}`)
  return node as T
}
function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#i-${name}`)
  svg.append(use)
  return svg
}
function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.textContent = text
  if (className) node.className = className
  return node
}
function button(label: string, className: string, handler: () => void): HTMLButtonElement {
  const node = textElement('button', label, className)
  node.type = 'button'
  node.addEventListener('click', handler)
  return node
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
function isBlock(value: unknown): value is Block {
  return isRecord(value) && ['p', 'h2', 'quote', 'task'].includes(String(value.kind)) && typeof value.text === 'string' && value.text.length <= 50_000 && (value.checked === undefined || typeof value.checked === 'boolean')
}
function isDocument(value: unknown): value is DemoDocument {
  return isRecord(value) && ['id', 'title', 'subtitle', 'group', 'category'].every((key) => typeof value[key] === 'string' && String(value[key]).length <= 500) && typeof value.favorite === 'boolean' && Array.isArray(value.blocks) && value.blocks.length <= 500 && value.blocks.every(isBlock)
}

let restoreError = false
let state: DemoState = {
  documents: structuredClone(seedDocuments), activeId: 'space', tabs: ['space', 'weekly'],
  preferences: { theme: 'light', font: 'sans', size: 16 },
}
try {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    if (stored.length > 2_000_000) throw new Error('演示缓存超限')
    const parsed: unknown = JSON.parse(stored)
    if (!isRecord(parsed) || !Array.isArray(parsed.documents) || parsed.documents.length === 0 || parsed.documents.length > 50 || !parsed.documents.every(isDocument)) throw new Error('演示缓存格式错误')
    const documents = parsed.documents
    if (new Set(documents.map((doc) => doc.id)).size !== documents.length) throw new Error('文档身份重复')
    const activeId = documents.find((doc) => doc.id === parsed.activeId)?.id ?? documents[0].id
    const tabs = Array.isArray(parsed.tabs) ? parsed.tabs.filter((id): id is string => typeof id === 'string' && documents.some((doc) => doc.id === id)) : [activeId]
    const preferences = isRecord(parsed.preferences) ? parsed.preferences : {}
    state = {
      documents, activeId, tabs: [...new Set([...tabs, activeId])], preferences: {
        theme: preferences.theme === 'dark' || preferences.theme === 'system' ? preferences.theme : 'light',
        font: preferences.font === 'serif' ? 'serif' : 'sans',
        size: typeof preferences.size === 'number' ? Math.max(15, Math.min(21, preferences.size)) : 16,
      },
    }
  }
} catch {
  restoreError = true
}

const workspace = element('workspace')
const body = element('document-body')
const title = element('document-title')
const readingArea = element('reading-area')
const query = element<HTMLInputElement>('palette-query')
const systemTheme = matchMedia('(prefers-color-scheme: dark)')
const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog'))
const collapsedGroups = new Set<string>(['项目手记'])
const documentScroll = new Map<string, number>()
let filter = 'all'
let saveTimer: ReturnType<typeof setTimeout> | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined
let headingObserver: IntersectionObserver | undefined
let searchResults: SearchResult[] = []
let searchIndex = 0
let compositionActive = false
let restored = !restoreError && localStorageAvailable()

function localStorageAvailable(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== null } catch { return false }
}
function activeDocument(): DemoDocument {
  return state.documents.find((doc) => doc.id === state.activeId) ?? state.documents[0]
}
function toast(message: string): void {
  clearTimeout(toastTimer)
  const node = element('toast')
  node.textContent = message
  node.hidden = false
  toastTimer = setTimeout(() => { node.hidden = true }, 2700)
}
function persist(): void {
  clearTimeout(saveTimer)
  try {
    const serialized = JSON.stringify(state)
    if (serialized.length > 2_000_000) throw new Error('演示存储容量已满')
    localStorage.setItem(STORAGE_KEY, serialized)
    element('save-message').textContent = '已保存在此浏览器'
    restored = true
  } catch {
    element('save-message').textContent = '保存失败 · 请导出备份'
    toast('浏览器存储不可用或已满。请用「更多 → 导出 Markdown」保留内容。')
  }
}
function scheduleSave(): void {
  element('save-message').textContent = '正在保存…'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persist, 450)
}
function renderNavigation(): void {
  const tree = element('document-tree')
  tree.replaceChildren()
  element('recent-count').textContent = String(state.documents.length)
  element('favorite-count').textContent = String(state.documents.filter((doc) => doc.favorite).length)
  element('collection-label').textContent = filter === 'favorites' ? '已收藏的文档' : filter === 'recent' ? '最近编辑' : '我的文档'
  document.querySelectorAll<HTMLElement>('[data-filter]').forEach((node) => {
    node.classList.toggle('selected', node.dataset.filter === filter)
  })
  const documents = filter === 'favorites' ? state.documents.filter((doc) => doc.favorite) : state.documents
  const groups = filter === 'all' ? [...new Set(documents.map((doc) => doc.group))] : ['']
  if (documents.length === 0) tree.append(textElement('p', '还没有收藏。点击文档标题上方的星标，把喜欢的内容留在这里。', 'empty-result'))
  for (const group of groups) {
    const groupDocuments = group ? documents.filter((doc) => doc.group === group) : documents
    if (group) {
      const folder = button('', 'folder-button', () => {
        if (collapsedGroups.has(group)) collapsedGroups.delete(group)
        else collapsedGroups.add(group)
        renderNavigation()
      })
      folder.setAttribute('aria-expanded', String(!collapsedGroups.has(group)))
      folder.append(icon(collapsedGroups.has(group) ? 'caret-right' : 'caret-down'), textElement('span', group), textElement('span', String(groupDocuments.length), 'folder-count'))
      tree.append(folder)
    }
    if (group && collapsedGroups.has(group)) continue
    const children = textElement('div', '', 'folder-children')
    for (const doc of groupDocuments) {
      const item = button('', `tree-document${doc.id === state.activeId ? ' active' : ''}`, () => openDocument(doc.id))
      item.title = doc.title
      if (doc.id === state.activeId) item.setAttribute('aria-current', 'page')
      item.append(icon('file-text'), textElement('span', doc.title || '未命名笔记'))
      children.append(item)
    }
    tree.append(children)
  }
  const tabs = element('tabs')
  tabs.replaceChildren()
  for (const id of state.tabs) {
    const doc = state.documents.find((item) => item.id === id)
    if (!doc) continue
    const wrapper = textElement('div', '', `tab${id === state.activeId ? ' active' : ''}`)
    wrapper.setAttribute('role', 'presentation')
    const select = button('', 'tab-select', () => openDocument(id))
    select.id = `tab-${id}`
    select.setAttribute('role', 'tab')
    select.setAttribute('aria-selected', String(id === state.activeId))
    select.tabIndex = id === state.activeId ? 0 : -1
    select.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const offset = event.key === 'ArrowLeft' ? -1 : 1
      const next = state.tabs[(state.tabs.indexOf(id) + offset + state.tabs.length) % state.tabs.length]
      openDocument(next)
      element(`tab-${next}`).focus()
    })
    select.append(icon('file-text'), textElement('span', doc.title || '未命名笔记'))
    const close = button('', 'icon-button close-tab', () => closeTab(id))
    close.setAttribute('aria-label', `关闭标签：${doc.title}`)
    close.title = state.tabs.length === 1 ? '保留最后一个写作标签' : '关闭标签'
    close.disabled = state.tabs.length === 1
    close.append(icon('x'))
    wrapper.append(select, close)
    tabs.append(wrapper)
  }
  const favorite = element('favorite-button')
  favorite.setAttribute('aria-pressed', String(activeDocument().favorite))
  favorite.setAttribute('aria-label', activeDocument().favorite ? '取消收藏' : '收藏文档')
  favorite.title = activeDocument().favorite ? '取消收藏' : '收藏文档'
}

function renderOutline(): void {
  headingObserver?.disconnect()
  const outline = element('outline')
  outline.replaceChildren()
  const headings = Array.from(body.querySelectorAll<HTMLHeadingElement>('h2'))
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]
    heading.id = `heading-${index}`
    const entry = button('', `outline-item${index === 0 ? ' active' : ''}`, () => {
      heading.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
      if (innerWidth < 1024) workspace.classList.remove('outline-popover')
    })
    entry.dataset.heading = heading.id
    entry.title = heading.textContent ?? ''
    entry.append(textElement('span', heading.textContent ?? '', 'outline-title'))
    outline.append(entry)
  }
  if (headings.length === 0) outline.append(textElement('p', '标题会出现在这里', 'margin-heading'))
  headingObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    if (visible.length === 0) return
    outline.querySelectorAll<HTMLElement>('[data-heading]').forEach((entry) => {
      const active = entry.dataset.heading === visible[0].target.id
      entry.classList.toggle('active', active)
      if (active) entry.setAttribute('aria-current', 'location')
      else entry.removeAttribute('aria-current')
    })
  }, { root: readingArea, rootMargin: '-5% 0px -60% 0px', threshold: 0 })
  headings.forEach((heading) => headingObserver?.observe(heading))
}
function updateStats(): void {
  const text = `${activeDocument().title}${activeDocument().blocks.map((block) => block.text).join('')}`
  const count = (text.match(/[\u3400-\u9fff]|[a-zA-Z0-9]+/g) ?? []).length
  element('word-count').textContent = `${count} 字`
  element('read-time').textContent = `约 ${Math.max(1, Math.ceil(count / 350))} 分钟读完`
}
function renderDocument(): void {
  const doc = activeDocument()
  title.textContent = doc.title
  element('document-subtitle').textContent = doc.subtitle
  element('breadcrumb-group').textContent = doc.group
  element('breadcrumb-file').textContent = `${doc.title || '未命名笔记'}.md`
  element('document-category').textContent = doc.category
  body.replaceChildren()
  doc.blocks.forEach((block) => {
    const node = textElement(block.kind === 'quote' ? 'blockquote' : block.kind === 'task' ? 'div' : block.kind, '')
    node.dataset.kind = block.kind
    if (block.kind === 'task') {
      node.className = `task${block.checked ? ' done' : ''}`
      const check = button('', 'task-check', () => {
        node.classList.toggle('done')
        check.setAttribute('aria-checked', String(node.classList.contains('done')))
        captureContent()
      })
      check.contentEditable = 'false'
      check.setAttribute('role', 'checkbox')
      check.setAttribute('aria-label', block.text)
      check.setAttribute('aria-checked', String(Boolean(block.checked)))
      check.append(icon('check'))
      node.append(check, textElement('span', block.text))
    } else node.textContent = block.text
    body.append(node)
  })
  const related = state.documents.filter((item) => item.id !== doc.id && item.group === doc.group).slice(0, 2)
  element('relation-count').textContent = String(related.length)
  const relatedLinks = element('related-links')
  relatedLinks.replaceChildren()
  relatedLinks.hidden = true
  for (const item of related) relatedLinks.append(button(item.title, '', () => openDocument(item.id)))
  if (!related.length) relatedLinks.append(textElement('span', '当前还没有同组笔记'))
  renderNavigation()
  renderOutline()
  updateStats()
  readingArea.scrollTop = documentScroll.get(doc.id) ?? 0
}
function captureContent(): void {
  if (compositionActive) return
  const doc = activeDocument()
  doc.title = (title.textContent ?? '').slice(0, 200)
  const blocks: Block[] = []
  for (const child of Array.from(body.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent?.trim()) blocks.push({ kind: 'p', text: child.textContent })
      continue
    }
    if (!(child instanceof HTMLElement)) continue
    const kind = child.tagName === 'H2' ? 'h2' : child.tagName === 'BLOCKQUOTE' ? 'quote' : child.classList.contains('task') ? 'task' : 'p'
    const text = (kind === 'task' ? child.querySelector('span')?.textContent : child.innerText) ?? ''
    blocks.push({ kind, text: text.slice(0, 50_000), ...(kind === 'task' ? { checked: child.classList.contains('done') } : {}) })
  }
  doc.blocks = blocks.slice(0, 500)
  renderNavigation()
  renderOutline()
  updateStats()
  scheduleSave()
}
function openDocument(id: string): void {
  if (!state.documents.some((doc) => doc.id === id)) return
  documentScroll.set(state.activeId, readingArea.scrollTop)
  state.activeId = id
  if (!state.tabs.includes(id)) state.tabs.push(id)
  collapsedGroups.delete(activeDocument().group)
  workspace.classList.remove('mobile-navigation', 'outline-popover')
  closeDialogs()
  renderDocument()
  persist()
}
function closeTab(id: string): void {
  if (state.tabs.length === 1) return
  const index = state.tabs.indexOf(id)
  state.tabs = state.tabs.filter((tab) => tab !== id)
  if (state.activeId === id) openDocument(state.tabs[Math.min(index, state.tabs.length - 1)])
  else { renderNavigation(); persist() }
}
function newDocument(): void {
  if (state.documents.length >= 50) { toast('Demo 最多保留 50 篇文档，请先导出已有内容。'); return }
  const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  state.documents.unshift({ id, title: '未命名笔记', subtitle: '从一句话开始。', group: '随笔与思考', category: '笔记', favorite: false, blocks: [{ kind: 'p', text: '在这里写下你的第一个想法。' }] })
  filter = 'all'
  openDocument(id)
  title.focus()
  const range = document.createRange()
  range.selectNodeContents(title)
  const selection = getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}
function closeDialogs(): void { dialogs.forEach((dialog) => { if (dialog.open) dialog.close() }) }
function openDialog(id: string): void {
  closeDialogs()
  element<HTMLDialogElement>(id).showModal()
}
function applyPreferences(): void {
  const preferences = state.preferences
  const theme = preferences.theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preferences.theme
  document.documentElement.dataset.theme = theme
  document.documentElement.style.setProperty('--text-size', `${preferences.size}px`)
  document.documentElement.style.setProperty('--body-font', preferences.font === 'serif' ? "'Noto Serif CJK SC', 'Source Han Serif SC', 'SimSun', serif" : "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', sans-serif")
  element('theme-button').replaceChildren(icon(theme === 'dark' ? 'sun' : 'moon'))
  document.querySelectorAll<HTMLElement>('[data-theme-choice]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.themeChoice === preferences.theme)))
  element<HTMLSelectElement>('font-choice').value = preferences.font
  element<HTMLInputElement>('font-size').value = String(preferences.size)
  element('font-size-value').textContent = String(preferences.size)
}
function toggleFocus(): void {
  const enabled = workspace.classList.toggle('focus-mode')
  workspace.classList.remove('mobile-navigation', 'outline-popover')
  element('focus-button').setAttribute('aria-pressed', String(enabled))
  element('focus-button').querySelector('span')!.textContent = enabled ? '退出专注' : '专注'
  if (enabled) toast('已进入专注写作，按 Esc 返回')
}
function toggleOutline(): void {
  if (workspace.classList.contains('focus-mode')) toggleFocus()
  if (innerWidth < 1024) {
    const visible = workspace.classList.toggle('outline-popover')
    workspace.classList.remove('outline-hidden')
    element('outline-button').setAttribute('aria-pressed', String(visible))
  } else {
    const hidden = workspace.classList.toggle('outline-hidden')
    element('outline-button').setAttribute('aria-pressed', String(!hidden))
  }
}
function exportMarkdown(): void {
  const doc = activeDocument()
  const markdown = `# ${doc.title}\n\n${doc.blocks.map((block) => {
    if (block.kind === 'h2') return `## ${block.text}`
    if (block.kind === 'quote') return block.text.split('\n').map((line) => `> ${line}`).join('\n')
    if (block.kind === 'task') return `- [${block.checked ? 'x' : ' '}] ${block.text}`
    return block.text
  }).join('\n\n')}\n`
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  const filename = Array.from(doc.title || '未命名笔记').filter((character) => character.charCodeAt(0) >= 32).join('').replace(/[<>:"/\\|?*]/g, '_')
  link.download = `${filename}.md`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  closeDialogs()
  toast('已发起 Markdown 下载')
}

const actions: Record<string, () => void> = {
  sidebar: () => {
    if (workspace.classList.contains('focus-mode')) toggleFocus()
    workspace.classList.toggle(innerWidth <= 760 ? 'mobile-navigation' : 'sidebar-hidden')
  },
  focus: toggleFocus, outline: toggleOutline, new: newDocument, export: exportMarkdown,
  favorite: () => { activeDocument().favorite = !activeDocument().favorite; renderNavigation(); persist(); closeDialogs() },
  related: () => { const node = element('related-links'); node.hidden = !node.hidden },
  theme: () => {
    state.preferences.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    applyPreferences()
    persist()
  },
  search: () => { openDialog('palette'); query.value = ''; renderSearch(); query.focus() },
  more: () => openDialog('more-menu'), settings: () => openDialog('settings-dialog'), about: () => openDialog('about-dialog'),
  'close-about': closeDialogs,
}

const commands: SearchResult[] = [
  { title: '新建文档', description: '从一句话开始', icon: 'plus', run: newDocument },
  { title: '切换专注模式', description: '收起导航和页边目录', icon: 'arrows-out-simple', run: toggleFocus },
  { title: '展开或收起页边目录', description: '查看当前文章结构', icon: 'list', run: toggleOutline },
  { title: '切换明暗主题', description: '雾白与夜松', icon: 'moon', run: actions.theme },
  { title: '导出 Markdown', description: '下载当前笔记的 .md 文件', icon: 'download-simple', run: exportMarkdown },
  { title: '阅读与外观', description: '调整字体和文字大小', icon: 'text-aa', run: actions.settings },
]
function selectSearch(index: number): void {
  searchIndex = Math.max(0, Math.min(searchResults.length - 1, index))
  element('palette-results').querySelectorAll<HTMLElement>('[role="option"]').forEach((node, position) => {
    node.setAttribute('aria-selected', String(position === searchIndex))
  })
  if (searchResults.length) {
    query.setAttribute('aria-activedescendant', `search-result-${searchIndex}`)
    element(`search-result-${searchIndex}`).scrollIntoView({ block: 'nearest' })
  } else query.removeAttribute('aria-activedescendant')
}
function executeSearch(index: number): void {
  const result = searchResults[index]
  if (!result) return
  closeDialogs()
  result.run()
}
function renderSearch(): void {
  const raw = query.value.trim()
  const commandMode = raw.startsWith('>')
  const needle = (commandMode ? raw.slice(1) : raw).trim().toLocaleLowerCase()
  searchResults = commandMode ? commands.filter((command) => `${command.title}${command.description}`.includes(needle)) : state.documents.filter((doc) => `${doc.title}${doc.group}${doc.blocks.map((block) => block.text).join('')}`.toLocaleLowerCase().includes(needle)).map((doc) => ({ title: doc.title || '未命名笔记', description: doc.group, icon: 'file-text', run: () => openDocument(doc.id) }))
  element('palette-caption').textContent = commandMode ? '可用命令' : needle ? `找到 ${searchResults.length} 篇文档` : '你的文档'
  const results = element('palette-results')
  results.replaceChildren()
  searchResults.slice(0, 50).forEach((result, index) => {
    const entry = button('', 'palette-result', () => executeSearch(index))
    entry.setAttribute('role', 'option')
    entry.id = `search-result-${index}`
    const text = textElement('div', '')
    text.append(textElement('span', result.title), textElement('small', result.description))
    entry.append(icon(result.icon), text, textElement('kbd', '↵'))
    entry.addEventListener('pointermove', () => selectSearch(index))
    results.append(entry)
  })
  if (!searchResults.length) results.append(textElement('p', '没有找到匹配内容，试试另一个关键词。', 'empty-result'))
  selectSearch(0)
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return
  const action = event.target.closest<HTMLElement>('[data-action]')?.dataset.action
  if (action) actions[action]?.()
  const nextFilter = event.target.closest<HTMLElement>('[data-filter]')?.dataset.filter
  if (nextFilter) { filter = nextFilter; renderNavigation() }
  const theme = event.target.closest<HTMLElement>('[data-theme-choice]')?.dataset.themeChoice
  if (theme === 'light' || theme === 'dark' || theme === 'system') { state.preferences.theme = theme; applyPreferences(); persist() }
})
dialogs.forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    const bounds = dialog.getBoundingClientRect()
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close()
  })
})
query.setAttribute('role', 'combobox')
query.setAttribute('aria-controls', 'palette-results')
query.setAttribute('aria-expanded', 'true')
query.setAttribute('aria-autocomplete', 'list')
query.addEventListener('input', renderSearch)
query.addEventListener('keydown', (event) => {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    selectSearch((searchIndex + (event.key === 'ArrowDown' ? 1 : -1) + searchResults.length) % Math.max(1, searchResults.length))
  }
  if (event.key === 'Enter') { event.preventDefault(); executeSearch(searchIndex) }
})
for (const editable of [title, body]) {
  editable.addEventListener('compositionstart', () => { compositionActive = true })
  editable.addEventListener('compositionend', () => { compositionActive = false; captureContent() })
  editable.addEventListener('input', captureContent)
  editable.addEventListener('paste', (event) => {
    event.preventDefault()
    const text = event.clipboardData?.getData('text/plain') ?? ''
    // 演示仅接受文本粘贴，避免把来源 HTML 或事件属性带入可编辑区域。
    document.execCommand('insertText', false, text.slice(0, 50_000))
  })
  editable.addEventListener('drop', (event) => event.preventDefault())
}
title.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); body.focus() }
})
element<HTMLSelectElement>('font-choice').addEventListener('change', (event) => {
  state.preferences.font = (event.target as HTMLSelectElement).value === 'serif' ? 'serif' : 'sans'
  applyPreferences(); persist()
})
element<HTMLInputElement>('font-size').addEventListener('input', (event) => {
  state.preferences.size = Number((event.target as HTMLInputElement).value)
  applyPreferences(); persist()
})
document.addEventListener('keydown', (event) => {
  if (event.isComposing || compositionActive || event.keyCode === 229) return
  const command = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()
  if (command && (key === 'k' || key === 'p')) { event.preventDefault(); actions.search(); return }
  if (dialogs.some((dialog) => dialog.open)) return
  if (command && key === 's') { event.preventDefault(); captureContent(); persist() }
  if (command && key === 'j') { event.preventDefault(); actions.sidebar() }
  if (command && event.shiftKey && key === 'l') { event.preventDefault(); toggleOutline() }
  if (event.key === 'Escape') {
    if (workspace.classList.contains('focus-mode')) toggleFocus()
    workspace.classList.remove('mobile-navigation', 'outline-popover')
  }
})
systemTheme.addEventListener('change', () => { if (state.preferences.theme === 'system') applyPreferences() })
window.addEventListener('pagehide', () => { if (saveTimer) persist() })
applyPreferences()
renderDocument()
if (restored) element('save-message').textContent = '已恢复此浏览器的笔记'
if (restoreError) toast('演示缓存无法读取，已载入示例；原缓存暂未覆盖。')
document.querySelectorAll('button svg, .breadcrumb svg, .palette-search svg').forEach((node) => node.setAttribute('aria-hidden', 'true'))
