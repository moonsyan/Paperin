import { Plugin, PluginKey, TextSelection, type Transaction } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import { analyzeDecorationChange } from './decoOptimize'
import {
  decideMermaidRender,
  mermaidThemeFromDocument,
  shouldCommitMermaidRender,
  shouldRerenderMermaidForTheme,
} from './mermaid-render-lifecycle'
import { isMermaidErrorSvg, mermaidFailureKind, mermaidStatusText, mermaidThemeOptions, sanitizeMermaidSource, sanitizeMermaidSvg } from './mermaid-source'
import { viewportChangedKey, streamInsertKey, readVisibleRange } from '../viewport/editorViewport'

export {
  decideMermaidRender,
  mermaidThemeFromDocument,
  shouldCommitMermaidRender,
  shouldRerenderMermaidForTheme,
} from './mermaid-render-lifecycle'
export type { MermaidRenderDecision } from './mermaid-render-lifecycle'

const MERMAID_RENDER_DELAY = 420
const MERMAID_RENDER_TIMEOUT = 4000
/** 单次渲染超时：须短于用户耐心；超时后走错误态，不再静默停在「正在渲染」 */
const MERMAID_SINGLE_RENDER_TIMEOUT = 4_000
/** 同源重新开渲的最短间隔，避免装饰重建把看门狗永远清零 */
const MERMAID_RERENDER_COOLDOWN_MS = 1_500
let diagramSequence = 0
type MermaidRuntime = typeof import('mermaid').default
/**
 * 自建串行队列。故意不走 mermaid.render() 外层队列：
 * 后者在单次 mermaidAPI.render 挂起时会永久堵住后续所有图，
 * 而我们的 Promise.race 超时无法取消已入队的内部任务。
 */
let mermaidRenderQueue: Promise<void> = Promise.resolve()
const enqueueMermaidRender = (render: () => Promise<void>): Promise<void> => {
  const task = mermaidRenderQueue.then(yieldToEventLoop).then(render)
  mermaidRenderQueue = task.catch(() => undefined)
  return task
}
const activePreviews = new Set<MermaidPreview>()
const renderListeners = new Set<() => void>()
let themeObserver: MutationObserver | null = null
let stuckWatchTimer: ReturnType<typeof setInterval> | null = null

const ensureStuckWatch = () => {
  if (stuckWatchTimer || typeof setInterval === 'undefined') return
  // 与单次 renderVersion 解耦：装饰重建会重置代次，只有全局扫描能保证离开「正在渲染」
  stuckWatchTimer = setInterval(() => {
    const now = Date.now()
    activePreviews.forEach((preview) => preview.failIfStuck(now))
  }, 1000)
}

const stopStuckWatchIfIdle = () => {
  if (activePreviews.size > 0 || !stuckWatchTimer) return
  clearInterval(stuckWatchTimer)
  stuckWatchTimer = null
}

type MermaidBlock = {
  pos: number
  language: string
}

type MermaidPreviewState = {
  decorations: DecorationSet
  blocks: MermaidBlock[]
}

export const isMermaidLanguage = (language: unknown): boolean =>
  typeof language === 'string' && language.trim().toLowerCase() === 'mermaid'

export const isSelectionInsideMermaidBlock = (
  from: number,
  to: number,
  blockPos: number,
  blockSize: number,
): boolean => from >= blockPos + 1 && to <= blockPos + blockSize - 1

export const shouldRemoveMermaidSource = (
  hasPreviewBlock: boolean,
  isEditingSource: boolean,
  hasRenderedSvg: boolean,
): boolean => hasPreviewBlock && !isEditingSource && hasRenderedSvg

/**
 * 装饰 key 同时包含源码指纹。切换文档时若位置相同但源码不同，
 * ProseMirror 不得复用旧 Mermaid widget，否则旧 SVG 会短暂甚至永久串到新文档。
 * 源码编辑期间插件会走 haveSameBlocks 快路径复用现有 widget，不会因每个字符重建。
 */
export const mermaidDecorationKey = (pos: number, source: string): string => {
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `mermaid-preview-${pos}-${(hash >>> 0).toString(16)}`
}

export const mermaidSandboxDocument = (runtimeUrl: string): string =>
  `<!doctype html><html><head><script src="${runtimeUrl}"></script></head><body></body></html>`

/** 沙箱可视测量区：过小（曾用 1×1）会让 flowchart 量出异常 viewBox，表现为大画布小图。 */
const MERMAID_SANDBOX_WIDTH = 1200
const MERMAID_SANDBOX_HEIGHT = 800

type MermaidSandbox = {
  frame: HTMLIFrameElement
  mermaid: MermaidRuntime
}

let sharedSandbox: MermaidSandbox | null = null
let sharedSandboxLoading: Promise<MermaidSandbox> | null = null

const detachSharedSandbox = () => {
  sharedSandbox?.frame.remove()
  sharedSandbox = null
}

const loadMermaidSandbox = async (): Promise<MermaidSandbox> => {
  if (sharedSandbox?.frame.isConnected) return sharedSandbox
  if (sharedSandboxLoading) return sharedSandboxLoading

  let loading!: Promise<MermaidSandbox>
  loading = (async () => {
    detachSharedSandbox()
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:0',
      `width:${MERMAID_SANDBOX_WIDTH}px`,
      `height:${MERMAID_SANDBOX_HEIGHT}px`,
      'border:0',
      'visibility:hidden',
      'pointer-events:none',
    ].join(';')
    frame.srcdoc = mermaidSandboxDocument(new URL('mermaid.min.js', window.location.href).toString())

    const loaded = new Promise<void>((resolve, reject) => {
      frame.addEventListener('load', () => resolve(), { once: true })
      frame.addEventListener('error', () => reject(new Error('Mermaid 运行时加载失败')), { once: true })
    })
    document.body.appendChild(frame)

    try {
      await loaded
      const frameDocument = frame.contentDocument
      const frameWindow = frame.contentWindow as (Window & { mermaid?: MermaidRuntime }) | null
      const mermaid = frameWindow?.mermaid
      if (!frameDocument?.body || !mermaid) throw new Error('Mermaid 运行时加载失败')
      const sandbox = { frame, mermaid }
      sharedSandbox = sandbox
      return sandbox
    } catch (error) {
      frame.remove()
      sharedSandbox = null
      throw error
    } finally {
      if (sharedSandboxLoading === loading) sharedSandboxLoading = null
    }
  })()

  sharedSandboxLoading = loading
  return loading
}

/**
 * Mermaid 会把 flowchart 标签临时插入当前文档并据此测量布局。
 * 编辑器的排版规则会参与这个测量并把层间距放大；在同源 iframe 中渲染后只取回 SVG，
 * 既隔离页面 CSS，又不改变用户的 Mermaid 源码。
 * 沙箱复用：避免每张图都重新拉 mermaid.min.js，降低「一直正在渲染」概率。
 */
const renderMermaidInSandbox = async (id: string, source: string, theme: string) => {
  const sandbox = await loadMermaidSandbox()
  const frameDocument = sandbox.frame.contentDocument
  if (!frameDocument?.body) {
    detachSharedSandbox()
    throw new Error('Mermaid 运行时加载失败')
  }
  // 清掉上一次残留节点，避免测量互相干扰
  frameDocument.body.replaceChildren()
  sandbox.mermaid.initialize(mermaidThemeOptions(theme))
  return await sandbox.mermaid.mermaidAPI.render(id, source, frameDocument.body)
}

/**
 * 渲染之间让出主线程。优先 setTimeout(0)：requestIdleCallback 在重绘/长任务
 * 压力下可能把整条 Mermaid 串行队列拖到“永远等空闲”，表现为一直“正在渲染”。
 */
const yieldToEventLoop = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0))

const getErrorMessage = (error: unknown): string => mermaidStatusText(error)

const observeThemeChanges = () => {
  if (themeObserver || typeof MutationObserver === 'undefined') return
  let themeRenderTimer: ReturnType<typeof setTimeout> | undefined
  let lastTheme: string | null = document.documentElement.dataset.theme ?? null
  themeObserver = new MutationObserver(() => {
    const nextTheme = document.documentElement.dataset.theme ?? ''
    if (!shouldRerenderMermaidForTheme(lastTheme, nextTheme)) {
      lastTheme = nextTheme || lastTheme
      return
    }
    lastTheme = nextTheme
    // 主题属性可能被连续写入；合并成一次强制重绘
    if (themeRenderTimer) clearTimeout(themeRenderTimer)
    themeRenderTimer = setTimeout(() => {
      themeRenderTimer = undefined
      activePreviews.forEach((preview) => preview.renderNow({ force: true }))
    }, 50)
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}

class MermaidPreview {
  readonly dom: HTMLElement

  private readonly preview: HTMLElement
  private readonly status: HTMLElement
  private readonly button: HTMLButtonElement
  private readonly getPos: () => number | undefined
  private readonly view: EditorView
  private source = ''
  private renderTimer: ReturnType<typeof setTimeout> | undefined
  private renderPromise: Promise<void> | null = null
  private renderVersion = 0
  private inFlightPrepared: string | null = null
  private committedPrepared: string | null = null
  private isEditingSource = false
  private attachWaits = 0
  /** 本次进入加载态的时刻；供全局扫描看门狗使用，不受 renderVersion 抖动影响 */
  private loadingStartedAt = 0
  private lastStartAt = 0

  constructor(view: EditorView, getPos: () => number | undefined, source: string) {
    this.view = view
    this.getPos = getPos
    this.source = source

    const container = document.createElement('section')
    container.className = 'mermaid-block'
    container.contentEditable = 'false'
    const toolbar = document.createElement('div')
    toolbar.className = 'mermaid-toolbar'
    const label = document.createElement('span')
    label.className = 'mermaid-label'
    label.textContent = 'Mermaid'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'mermaid-source-toggle'
    button.textContent = '编辑源码'
    button.setAttribute('aria-label', '编辑 Mermaid 源码')
    button.setAttribute('aria-pressed', 'false')
    button.addEventListener('mousedown', this.handleToggleSourcePointer, true)
    button.addEventListener('click', this.handleToggleSourceClick, true)
    toolbar.append(label, button)

    const preview = document.createElement('div')
    preview.className = 'mermaid-preview'
    preview.setAttribute('aria-live', 'polite')
    const status = document.createElement('div')
    status.className = 'mermaid-status'
    status.textContent = '准备渲染…'
    preview.append(status)
    container.append(toolbar, preview)

    this.dom = container
    this.preview = preview
    this.status = status
    this.button = button
    this.loadingStartedAt = Date.now()
    activePreviews.add(this)
    ensureStuckWatch()
    observeThemeChanges()
    this.renderPromise = new Promise((resolve) => {
      window.setTimeout(() => {
        void this.renderNow().then(resolve, () => resolve())
      }, 0)
    })
  }

  /** 全局扫描：装饰重建清零代次后仍能把卡死态打成错误 */
  failIfStuck = (now: number) => {
    if (this.isEditingSource) return
    if (this.preview.querySelector('svg')) return
    if (!this.loadingStartedAt) return
    if (now - this.loadingStartedAt < MERMAID_SINGLE_RENDER_TIMEOUT) return
    const text = this.status.textContent ?? ''
    if (!/准备渲染|正在加载|正在绘制|正在渲染/.test(text)) return
    this.markFailed(getErrorMessage(new Error('渲染超时')))
  }

  private markFailed(message: string) {
    this.inFlightPrepared = null
    this.renderPromise = null
    this.loadingStartedAt = 0
    this.preview.replaceChildren(this.status)
    this.status.textContent = message
    this.status.classList.add('is-error')
  }

  private setLoadingStatus(message: string) {
    if (this.preview.querySelector('svg')) return
    this.preview.replaceChildren(this.status)
    this.status.classList.remove('is-error')
    this.status.textContent = message
    if (!this.loadingStartedAt) this.loadingStartedAt = Date.now()
  }

  updateSource(source: string) {
    if (source === this.source) return
    this.source = source
    this.renderVersion += 1
    this.inFlightPrepared = null
    this.committedPrepared = null
    if (this.renderTimer) clearTimeout(this.renderTimer)
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined
      this.renderNow()
    }, MERMAID_RENDER_DELAY)
  }

  renderNow = (options?: { force?: boolean }): Promise<void> => {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer)
      this.renderTimer = undefined
    }
    const force = options?.force === true
    const prepared = sanitizeMermaidSource(this.source)
    if (!prepared) {
      this.inFlightPrepared = null
      this.committedPrepared = null
      this.loadingStartedAt = 0
      this.preview.replaceChildren(this.status)
      this.status.classList.remove('is-error')
      this.status.textContent = '输入 Mermaid 图表源码'
      this.renderPromise = Promise.resolve()
      return this.renderPromise
    }
    if (!this.dom.isConnected && this.attachWaits < 8) {
      this.attachWaits += 1
      this.setLoadingStatus('准备渲染…')
      this.renderPromise = new Promise((resolve) => {
        requestAnimationFrame(() => {
          void this.renderNow(options).then(resolve, () => resolve())
        })
      })
      return this.renderPromise
    }
    this.attachWaits = 0

    const decision = decideMermaidRender({
      prepared,
      force,
      inFlightPrepared: this.inFlightPrepared,
      hasInFlightPromise: Boolean(this.renderPromise) && this.inFlightPrepared === prepared,
      committedPrepared: this.committedPrepared,
      hasSvg: Boolean(this.preview.querySelector('svg')),
    })
    if (decision.action === 'reuse-inflight' && this.renderPromise) return this.renderPromise
    if (decision.action === 'reuse-committed') {
      this.loadingStartedAt = 0
      this.renderPromise = Promise.resolve()
      return this.renderPromise
    }

    const now = Date.now()
    if (
      !force &&
      this.lastStartAt > 0 &&
      now - this.lastStartAt < MERMAID_RERENDER_COOLDOWN_MS &&
      (this.inFlightPrepared === prepared || Boolean(this.renderPromise))
    ) {
      return this.renderPromise ?? Promise.resolve()
    }

    this.renderVersion += 1
    const version = this.renderVersion
    this.inFlightPrepared = prepared
    this.lastStartAt = now
    this.loadingStartedAt = now
    this.setLoadingStatus('正在加载 Mermaid…')

    const draw = async (text: string, theme: string) => {
      this.setLoadingStatus('正在绘制图表…')
      const id = `paperin-mermaid-${diagramSequence++}`
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      const { svg, bindFunctions } = await Promise.race([
        renderMermaidInSandbox(id, text, theme),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('渲染超时')), MERMAID_SINGLE_RENDER_TIMEOUT)
        }),
      ]).finally(() => {
        if (timeoutHandle) clearTimeout(timeoutHandle)
      })
      if (isMermaidErrorSvg(svg)) throw new Error('Syntax error in text')
      const safeSvg = sanitizeMermaidSvg(svg)
      if (!safeSvg) throw new Error('图表结果不是可显示的 SVG')
      if (!shouldCommitMermaidRender(activePreviews.has(this), version, this.renderVersion)) return
      const holder = document.createElement('div')
      holder.innerHTML = safeSvg
      const parsedSvg = holder.querySelector('svg')
      if (!parsedSvg) throw new Error('图表结果不是可显示的 SVG')
      this.preview.replaceChildren(parsedSvg)
      this.committedPrepared = text
      this.inFlightPrepared = null
      this.loadingStartedAt = 0
      bindFunctions?.(this.preview)
    }
    this.renderPromise = enqueueMermaidRender(async () => {
      if (!shouldCommitMermaidRender(activePreviews.has(this), version, this.renderVersion)) return
      const theme = mermaidThemeFromDocument(document.documentElement.dataset.theme)
      try {
        await draw(prepared, theme)
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (mermaidFailureKind(message) !== 'temporary') throw error
        await draw(prepared, theme)
      }
    })
      .catch((error: unknown) => {
        if (!shouldCommitMermaidRender(activePreviews.has(this), version, this.renderVersion)) return
        this.markFailed(getErrorMessage(error))
      })
      .finally(() => {
        if (this.inFlightPrepared === prepared && version === this.renderVersion) {
          this.inFlightPrepared = null
        }
        if (!shouldCommitMermaidRender(activePreviews.has(this), version, this.renderVersion)) return
        renderListeners.forEach((listener) => listener())
      })
    return this.renderPromise
  }

  destroy = () => {
    if (this.renderTimer) clearTimeout(this.renderTimer)
    this.renderVersion += 1
    this.inFlightPrepared = null
    this.committedPrepared = null
    this.loadingStartedAt = 0
    this.resolveSourceBlockElement()?.classList.remove('is-source-visible')
    this.button.removeEventListener('mousedown', this.handleToggleSourcePointer, true)
    this.button.removeEventListener('click', this.handleToggleSourceClick, true)
    activePreviews.delete(this)
    stopStuckWatchIfIdle()
    if (activePreviews.size === 0 && themeObserver) {
      themeObserver.disconnect()
      themeObserver = null
    }
  }

  getSourcePosition = (): number | undefined => this.resolveCodeBlockPos()

  belongsTo = (view: EditorView): boolean => this.view === view

  private resolveSourceBlockElement = (): HTMLElement | null => {
    let sibling: Element | null = this.dom.nextElementSibling
    while (sibling) {
      if (sibling instanceof HTMLElement && sibling.classList.contains('mermaid-source-block')) {
        return sibling
      }
      sibling = sibling.nextElementSibling
    }
    return null
  }

  private resolveCodeBlockPos = (): number | undefined => {
    const fromWidget = this.getPos()
    if (typeof fromWidget === 'number') return fromWidget
    const pre = this.resolveSourceBlockElement()
    if (!pre) return undefined
    try {
      const inside = this.view.posAtDOM(pre, 0)
      const $pos = this.view.state.doc.resolve(inside)
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        if ($pos.node(depth).type.name === 'code_block') return $pos.before(depth)
      }
    } catch {
      return undefined
    }
    return undefined
  }

  syncSelection = () => {
    // 默认始终预览图：不因选区落在源码块就自动切到源码态（打开文档/恢复光标常会误触）。
    // 进入源码只走工具栏「编辑源码」；选区离开时再回到预览。
    if (!this.isEditingSource) return
    const codePos = this.resolveCodeBlockPos()
    if (typeof codePos !== 'number') {
      this.showPreview()
      return
    }
    const codeNode = this.view.state.doc.nodeAt(codePos)
    const { from, to } = this.view.state.selection
    const isInsideCodeBlock =
      codeNode &&
      codeNode.type.name === 'code_block' &&
      isSelectionInsideMermaidBlock(from, to, codePos, codeNode.nodeSize)
    if (!isInsideCodeBlock) this.showPreview()
  }

  toggleSourceFromUi = (): void => {
    this.handleToggleSource()
  }

  private handleToggleSourcePointer = (event: MouseEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
  }

  private handleToggleSourceClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    this.handleToggleSource()
  }

  private handleToggleSource = () => {
    if (this.isEditingSource) {
      this.showPreview()
      this.button.focus()
      return
    }
    // 切源码时作废进行中的渲染，避免卡在「正在绘制」时点击无反馈
    if (this.renderTimer) {
      clearTimeout(this.renderTimer)
      this.renderTimer = undefined
    }
    this.renderVersion += 1
    this.inFlightPrepared = null
    this.loadingStartedAt = 0
    const codePos = this.resolveCodeBlockPos()
    if (typeof codePos !== 'number') {
      this.markFailed('无法定位源码块，请滚动后再试或重新打开文档')
      return
    }
    const codeNode = this.view.state.doc.nodeAt(codePos)
    if (!codeNode || codeNode.type.name !== 'code_block') {
      this.markFailed('源码块已失效，请重新打开文档')
      return
    }
    this.setSourceEditing(true)
    this.view.dispatch(
      this.view.state.tr
        .setSelection(TextSelection.create(this.view.state.doc, codePos + 1))
        .scrollIntoView(),
    )
    this.view.focus()
  }

  private showPreview() {
    this.setSourceEditing(false)
    void this.renderNow({ force: true })
  }

  private setSourceEditing(editing: boolean) {
    this.isEditingSource = editing
    this.dom.classList.toggle('is-editing-source', editing)
    this.resolveSourceBlockElement()?.classList.toggle('is-source-visible', editing)
    this.button.textContent = editing ? '查看图表' : '编辑源码'
    this.button.setAttribute('aria-pressed', String(editing))
    this.button.setAttribute('aria-label', editing ? '查看 Mermaid 图表' : '编辑 Mermaid 源码')
  }
}

const getMermaidBlocks = (doc: ProseNode): MermaidBlock[] => {
  const blocks: MermaidBlock[] = []
  // 3.1 Tier 1：仅扫描视口区间（含上下余量），视口外的 mermaid 块不创建预览 widget，
  // 避免大文档一次性渲染全部 mermaid 图（Tier 3 再按 IntersectionObserver 视口门控实际渲染）
  const { from, to } = readVisibleRange(doc)
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'code_block' || !isMermaidLanguage(node.attrs.language)) return
    blocks.push({ pos, language: node.attrs.language.trim().toLowerCase() })
    return false
  })
  return blocks
}

const buildMermaidDecorations = (doc: ProseNode, blocks = getMermaidBlocks(doc)): DecorationSet => {
  const decorations: Decoration[] = []
  blocks.forEach(({ pos }) => {
    const node = doc.nodeAt(pos)
    if (!node) return
    const key = mermaidDecorationKey(pos, node.textContent)
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'mermaid-source-block' }))
    decorations.push(
      Decoration.widget(
        pos,
        (view, getPos) => new MermaidPreview(view, getPos, node.textContent).dom,
        {
          key,
          side: -1,
          ignoreSelection: true,
          stopEvent: (event) => event.target instanceof Element && Boolean(event.target.closest('.mermaid-block')),
          destroy: (dom) => {
            const preview = Array.from(activePreviews).find((item) => item.dom === dom)
            preview?.destroy()
          },
        },
      ),
    )
  })
  return DecorationSet.create(doc, decorations)
}

const mapBlocks = (blocks: MermaidBlock[], tr: Transaction): MermaidBlock[] =>
  blocks.flatMap((block) => {
    const mapped = tr.mapping.mapResult(block.pos, -1)
    if (mapped.deleted) return []
    return [{ ...block, pos: mapped.pos }]
  })

const haveSameBlocks = (left: MermaidBlock[], right: MermaidBlock[]): boolean =>
  left.length === right.length &&
  left.every((block, index) => block.pos === right[index].pos && block.language === right[index].language)

const previewsForView = (view: EditorView): MermaidPreview[] =>
  Array.from(activePreviews).filter((preview) => preview.belongsTo(view))

export const mermaidPreviewKey = new PluginKey('mermaid-preview')

export const mermaidPreviewPlugin = new Plugin({
  key: mermaidPreviewKey,
  state: {
    init: (_config, state): MermaidPreviewState => {
      const blocks = getMermaidBlocks(state.doc)
      return { decorations: buildMermaidDecorations(state.doc, blocks), blocks }
    },
    apply: (tr, previous, _oldState, state) => {
      const previousState = previous as MermaidPreviewState
      // 3.1 Tier 2：分块流式插入的事务标记——跳过重扫，仅映射已有装饰，
      // 避免 N 块 × O(doc) 退化为 O(doc²)；流结束时由 viewportChangedKey 一次性重建。
      if (tr.getMeta(streamInsertKey)) {
        return {
          decorations: previousState.decorations.map(tr.mapping, tr.doc),
          blocks: mapBlocks(previousState.blocks, tr),
        }
      }
      // 视口变化：块集合未变则复用 widget，避免反复销毁导致永远停在「正在渲染」
      if (tr.getMeta(viewportChangedKey)) {
        const blocks = getMermaidBlocks(state.doc)
        if (haveSameBlocks(previousState.blocks, blocks)) {
          return {
            decorations: previousState.decorations.map(tr.mapping, tr.doc),
            blocks,
          }
        }
        return { decorations: buildMermaidDecorations(state.doc, blocks), blocks }
      }
      if (!tr.docChanged) {
        return {
          decorations: previousState.decorations.map(tr.mapping, tr.doc),
          blocks: mapBlocks(previousState.blocks, tr),
        }
      }
      // M13：段落内打字不触碰代码块，直接映射复用，避免每次按键全文档扫描。
      // 但映射对“删除起点恰为代码块起点”的 ReplaceStep 会误报存活：
      // StepMap.mapResult(pos, -1) 在 pos == 删除起点时不置 deleted（Ctrl+A
      // 后输入、选中块起点删除都会命中），陈旧块/幽灵预览残留到新内容上。
      // 快速路径下对每个映射后的块做 nodeAt 校验（每次按键仅数次 O(1) 查找），
      // 校验失败即按新 doc 重建并丢弃陈旧块
      const info = analyzeDecorationChange(tr)
      if (info.blockAt !== 'code_block' && !info.sliceBlocks.has('code_block')) {
        const mappedBlocks = mapBlocks(previousState.blocks, tr)
        let stale = false
        for (let i = 0; i < mappedBlocks.length; i++) {
          const node = state.doc.nodeAt(mappedBlocks[i].pos)
          if (!node || node.type.name !== 'code_block' || !isMermaidLanguage(node.attrs.language)) {
            stale = true
            break
          }
        }
        if (!stale) {
          return {
            decorations: previousState.decorations.map(tr.mapping, tr.doc),
            blocks: mappedBlocks,
          }
        }
        const blocks = getMermaidBlocks(state.doc)
        return { decorations: buildMermaidDecorations(state.doc, blocks), blocks }
      }
      const blocks = getMermaidBlocks(state.doc)
      const mappedBlocks = mapBlocks(previousState.blocks, tr)
      if (haveSameBlocks(mappedBlocks, blocks)) {
        // Mermaid 源码输入不会改变代码块的结构，必须复用预览 DOM，避免光标被重建打断。
        return { decorations: previousState.decorations.map(tr.mapping, tr.doc), blocks }
      }
      return { decorations: buildMermaidDecorations(state.doc, blocks), blocks }
    },
  },
  props: {
    decorations: (state) =>
      (mermaidPreviewKey.getState(state) as MermaidPreviewState | undefined)?.decorations,
  },
  view: (ownerView) => ({
    update: (view, previousState) => {
      const previews = previewsForView(ownerView)
      previews.forEach((preview) => preview.syncSelection())
      if (previousState.doc.eq(view.state.doc)) return
      previews.forEach((preview) => {
        const pos = preview.getSourcePosition()
        if (typeof pos !== 'number') return
        const node = view.state.doc.nodeAt(pos)
        if (!node || !isMermaidLanguage(node.attrs.language)) return
        preview.updateSource(node.textContent)
      })
    },
    // updateState 重建插件视图时仍可能复用 widget；实际移除由 widget.destroy 清理。
  }),
})

export const ensureMermaidRendered = async (): Promise<void> => {
  const renders = Array.from(activePreviews, (preview) => preview.renderNow())
  if (renders.length === 0) return
  await Promise.race([
    Promise.all(renders).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, MERMAID_RENDER_TIMEOUT)),
  ])
}

export const subscribeMermaidRender = (listener: () => void): (() => void) => {
  renderListeners.add(listener)
  return () => renderListeners.delete(listener)
}
