import { Plugin, PluginKey, TextSelection, type Transaction } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import { analyzeDecorationChange } from './decoOptimize'
import { isMermaidErrorSvg, mermaidFailureKind, mermaidStatusText, mermaidThemeOptions, sanitizeMermaidSource, sanitizeMermaidSvg } from './mermaid-source'
import { viewportChangedKey, streamInsertKey, readVisibleRange } from '../viewport/editorViewport'

const MERMAID_RENDER_DELAY = 420
const MERMAID_RENDER_TIMEOUT = 4000
/** 单次 mermaid.render 超时：串行队列内一次挂起不能阻塞后续所有图表 */
const MERMAID_SINGLE_RENDER_TIMEOUT = 15_000
let diagramSequence = 0
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null
/**
 * C-5：mermaid.render 内部使用共享临时容器，并发调用（多图表同时渲染、
 * 文档加载瞬间多个装饰同时 renderNow）会互相污染，报
 * "fragments are not allowed in template" 或串图。全部经此队列串行执行。
 */
let mermaidRenderQueue: Promise<void> = Promise.resolve()
const enqueueMermaidRender = (render: () => Promise<void>): Promise<void> => {
  const task = mermaidRenderQueue.then(yieldToEventLoop).then(render)
  // 队列保活：单次渲染失败不阻断后续渲染；返回给调用方的是未吞错的 task
  mermaidRenderQueue = task.catch(() => undefined)
  return task
}
const activePreviews = new Set<MermaidPreview>()
const renderListeners = new Set<() => void>()
let themeObserver: MutationObserver | null = null

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

/** 只有仍挂在当前渲染集合中的、且未被更新代次淘汰的结果才能写回 DOM。 */
export const shouldCommitMermaidRender = (
  isActive: boolean,
  renderVersion: number,
  currentVersion: number,
): boolean => isActive && renderVersion === currentVersion

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

const getMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => mermaid)
  }
  return mermaidPromise
}

/**
 * C-5 续：mermaid.initialize 非并发安全且开销大，原来在每个 diagram 的
 * renderNow 里重复调用，多图文档会被反复重建内部状态。改为按主题只初始化
 * 一次（主题切换时重新初始化），用 Promise 守护避免并发重复初始化。
 */
let mermaidReadyPromise: Promise<void> | null = null
let mermaidReadyTheme: string | null = null
const ensureMermaidReady = (theme: string): Promise<void> => {
  if (mermaidReadyTheme === theme && mermaidReadyPromise) return mermaidReadyPromise
  mermaidReadyTheme = theme
  mermaidReadyPromise = getMermaid().then((mermaid) => {
    mermaid.initialize(mermaidThemeOptions(theme))
  })
  return mermaidReadyPromise
}

/**
 * 渲染之间让出主线程：用 requestIdleCallback（超时兜底）让浏览器先处理
 * 输入事件与重绘，再继续下一个图的渲染。多图文档打开时用户点击左侧文件、
 * 滚动页面不再被整条串行队列冻结。
 */
const yieldToEventLoop = (): Promise<void> =>
  typeof requestIdleCallback === 'function'
    ? new Promise<void>((resolve) => requestIdleCallback(() => resolve(), { timeout: 200 }))
    : new Promise<void>((resolve) => setTimeout(resolve, 0))

const getErrorMessage = (error: unknown): string => mermaidStatusText(error)

const observeThemeChanges = () => {
  if (themeObserver || typeof MutationObserver === 'undefined') return
  themeObserver = new MutationObserver(() => {
    activePreviews.forEach((preview) => preview.renderNow())
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
  private isEditingSource = false
  private attachWaits = 0

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
    button.addEventListener('click', this.handleToggleSource)
    toolbar.append(label, button)

    const preview = document.createElement('div')
    preview.className = 'mermaid-preview'
    preview.setAttribute('aria-live', 'polite')
    const status = document.createElement('div')
    status.className = 'mermaid-status'
    status.textContent = '正在渲染图表…'
    preview.append(status)
    container.append(toolbar, preview)

    this.dom = container
    this.preview = preview
    this.status = status
    this.button = button
    activePreviews.add(this)
    observeThemeChanges()
    void this.renderNow()
  }

  updateSource(source: string) {
    if (source === this.source) return
    this.source = source
    this.renderVersion += 1
    if (this.renderTimer) clearTimeout(this.renderTimer)
    // 编辑源码时维持既有 SVG，停止输入后再更新，避免干扰光标与视觉闪烁。
    this.renderTimer = setTimeout(() => {
      this.renderTimer = undefined
      this.renderNow()
    }, MERMAID_RENDER_DELAY)
  }

  renderNow = (): Promise<void> => {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer)
      this.renderTimer = undefined
    }
    this.renderVersion += 1
    const version = this.renderVersion
    const prepared = sanitizeMermaidSource(this.source)
    if (!prepared) {
      this.preview.replaceChildren(this.status)
      this.status.classList.remove('is-error')
      this.status.textContent = '输入 Mermaid 图表源码'
      this.renderPromise = Promise.resolve()
      return this.renderPromise
    }
    if (!this.dom.isConnected && this.attachWaits < 8) {
      this.attachWaits += 1
      this.renderPromise = new Promise((resolve) => {
        requestAnimationFrame(() => {
          void this.renderNow().then(resolve, () => resolve())
        })
      })
      return this.renderPromise
    }
    this.attachWaits = 0
    this.preview.replaceChildren(this.status)
    this.status.classList.remove('is-error')
    this.status.textContent = '正在渲染图表…'
    const draw = async (mermaid: Awaited<ReturnType<typeof getMermaid>>, text: string) => {
      const id = `paperin-mermaid-${diagramSequence++}`
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      const { svg, bindFunctions } = await Promise.race([
        mermaid.render(id, text),
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
      this.preview.innerHTML = safeSvg
      bindFunctions?.(this.preview)
    }
    this.renderPromise = getMermaid()
      .then(() =>
        enqueueMermaidRender(async () => {
          const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default'
          await ensureMermaidReady(theme)
          const mermaid = await getMermaid()
          try {
            await draw(mermaid, prepared)
          } catch (error) {
            const message = error instanceof Error ? error.message : ''
            if (mermaidFailureKind(message) !== 'temporary') throw error
            await draw(mermaid, prepared)
          }
        }),
      )
      .catch((error: unknown) => {
        if (!shouldCommitMermaidRender(activePreviews.has(this), version, this.renderVersion)) return
        this.preview.replaceChildren(this.status)
        this.status.textContent = getErrorMessage(error)
        this.status.classList.add('is-error')
      })
      .finally(() => {
        if (!shouldCommitMermaidRender(activePreviews.has(this), version, this.renderVersion)) return
        renderListeners.forEach((listener) => listener())
      })
    return this.renderPromise
  }

  destroy = () => {
    if (this.renderTimer) clearTimeout(this.renderTimer)
    // 失效所有尚未完成的异步 render，避免切换文档后旧结果回写到复用的 widget。
    this.renderVersion += 1
    this.button.removeEventListener('click', this.handleToggleSource)
    activePreviews.delete(this)
    if (activePreviews.size === 0 && themeObserver) {
      themeObserver.disconnect()
      themeObserver = null
    }
  }

  getSourcePosition = (): number | undefined => this.getPos()

  syncSelection = () => {
    const codePos = this.getPos()
    if (typeof codePos !== 'number') return
    const codeNode = this.view.state.doc.nodeAt(codePos)
    const { from, to } = this.view.state.selection
    const isInsideCodeBlock =
      codeNode &&
      codeNode.type.name === 'code_block' &&
      isSelectionInsideMermaidBlock(from, to, codePos, codeNode.nodeSize)
    if (this.isEditingSource) {
      // 源码编辑态：选区移出代码块后切回预览
      if (isInsideCodeBlock) return
      this.showPreview()
      return
    }
    // 预览态：键盘/搜索把光标带入隐藏的源码块时自动切换源码编辑，
    // 否则光标在 display:none 的 pre 里消失，用户会盲改源码（H4）
    if (isInsideCodeBlock) this.setSourceEditing(true)
  }

  private handleToggleSource = () => {
    if (this.isEditingSource) {
      this.showPreview()
      this.button.focus()
      return
    }
    const codePos = this.getPos()
    if (typeof codePos !== 'number') return
    const codeNode = this.view.state.doc.nodeAt(codePos)
    if (!codeNode || codeNode.type.name !== 'code_block') return
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
    this.renderNow()
  }

  private setSourceEditing(editing: boolean) {
    this.isEditingSource = editing
    this.dom.classList.toggle('is-editing-source', editing)
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
      // 3.1 Tier 1：滚动跨越视口边界后，只在视口内重建 mermaid 预览（getMermaidBlocks 已限区间）
      if (tr.getMeta(viewportChangedKey)) {
        const blocks = getMermaidBlocks(state.doc)
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
  view: () => ({
    update: (view, previousState) => {
      activePreviews.forEach((preview) => preview.syncSelection())
      if (previousState.doc.eq(view.state.doc)) return
      activePreviews.forEach((preview) => {
        const pos = preview.getSourcePosition()
        if (typeof pos !== 'number') return
        const node = view.state.doc.nodeAt(pos)
        if (!node || !isMermaidLanguage(node.attrs.language)) return
        preview.updateSource(node.textContent)
      })
    },
    destroy: () => {
      activePreviews.forEach((preview) => preview.destroy())
    },
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
