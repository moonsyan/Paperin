import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import type { Transaction } from '@milkdown/kit/prose/state'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import { analyzeDecorationChange } from './decoOptimize'
import { streamInsertKey, viewportChangedKey } from '../viewport/editorViewport'
import { foldRegions, formatStructured, lineOffset, structuredKind, type FoldRegion } from '../../../lib/structured-code'

export const structuredCodeKey = new PluginKey('structured-code')

interface FoldMark {
  pos: number
  startLine: number
  /** 折叠时的正文指纹。正文一变就丢掉，避免藏住已经挪位的行。 */
  signature: string
}

interface StructuredState {
  decorations: DecorationSet
  folds: FoldMark[]
}

interface StructuredMeta {
  toggle?: { pos: number; startLine: number }
  mode?: 'fold-all' | 'expand-all'
  pos?: number
}

const isMermaid = (language: unknown): boolean =>
  typeof language === 'string' && language.trim().toLowerCase() === 'mermaid'

const textSignature = (text: string): string => {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${text.length}:${hash >>> 0}`
}

const isFolded = (folds: readonly FoldMark[], pos: number, startLine: number): boolean =>
  folds.some((fold) => fold.pos === pos && fold.startLine === startLine)

const toggleFold = (folds: FoldMark[], pos: number, startLine: number, signature: string): FoldMark[] =>
  isFolded(folds, pos, startLine)
    ? folds.filter((fold) => fold.pos !== pos || fold.startLine !== startLine)
    : [...folds, { pos, startLine, signature }]

const mapFolds = (folds: FoldMark[], tr: Transaction): FoldMark[] =>
  folds.flatMap((fold) => {
    const mapped = tr.mapping.mapResult(fold.pos, -1)
    if (mapped.deleted) return []
    const node = tr.doc.nodeAt(mapped.pos)
    if (!node || node.type.name !== 'code_block') return []
    if (textSignature(node.textContent) !== fold.signature) return []
    return [{ pos: mapped.pos, startLine: fold.startLine, signature: fold.signature }]
  })

const replaceBlockText = (view: EditorView, pos: number, next: string): void => {
  const node = view.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'code_block' || next === node.textContent) return
  const from = pos + 1
  const to = pos + node.nodeSize - 1
  const text = next ? view.state.schema.text(next) : null
  let tr = view.state.tr
  if (from < to && text) tr = tr.replaceWith(from, to, text)
  else if (from < to) tr = tr.delete(from, to)
  else if (text) tr = tr.insert(from, text)
  const caret = Math.min(tr.mapping.map(from), tr.doc.content.size)
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView())
}

const makeButton = (label: string, title: string, onClick: () => void): HTMLButtonElement => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'structured-code-btn'
  button.textContent = label
  button.title = title
  button.setAttribute('aria-label', title)
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!onClick) return
    onClick()
  })
  return button
}

const blockFromWidget = (view: EditorView, getPos: () => number | undefined): { pos: number; node: ProseNode } | null => {
  const pos = getPos()
  if (typeof pos !== 'number' || view.isDestroyed) return null
  const $pos = view.state.doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name !== 'code_block') continue
    return { pos: $pos.before(depth), node: $pos.node(depth) }
  }
  const node = view.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'code_block') return null
  return { pos, node }
}

const createToolbar = (
  view: EditorView,
  getPos: () => number | undefined,
  node: ProseNode,
  regions: FoldRegion[],
): HTMLElement => {
  const bar = document.createElement('div')
  bar.className = 'structured-code-tools'
  bar.contentEditable = 'false'
  const status = document.createElement('span')
  status.className = 'structured-code-status'
  const readBlock = () => blockFromWidget(view, getPos)
  const kind = structuredKind(String(node.attrs.language ?? ''), node.textContent)
  const run = (mode: 'pretty' | 'minify') => {
    const current = readBlock()
    if (!current) return
    const result = formatStructured(String(current.node.attrs.language ?? ''), current.node.textContent, mode)
    status.textContent = result.ok ? '' : result.message
    if (result.ok) replaceBlockText(view, current.pos, result.text)
  }
  if (kind) {
    bar.append(
      makeButton('格式化', kind === 'yaml' ? '按 YAML 排齐，保留注释' : '按 JSON 排齐', () => run('pretty')),
      makeButton('一行', kind === 'yaml' ? '压成一行，注释不会保留' : '压成一行', () => run('minify')),
    )
  }
  if (regions.length > 0) {
    bar.append(
      makeButton('折叠', '折叠这个代码块里的嵌套片段', () => {
        if (view.isDestroyed) return
        const current = readBlock()
        if (!current) return
        view.dispatch(view.state.tr.setMeta(structuredCodeKey, { mode: 'fold-all', pos: current.pos }))
      }),
      makeButton('展开', '展开这个代码块里的片段', () => {
        if (view.isDestroyed) return
        const current = readBlock()
        if (!current) return
        view.dispatch(view.state.tr.setMeta(structuredCodeKey, { mode: 'expand-all', pos: current.pos }))
      }),
    )
  }
  bar.append(status)
  return bar
}

const coveredByFold = (regions: FoldRegion[], folds: readonly FoldMark[], blockPos: number, line: number): boolean =>
  regions.some((region) =>
    isFolded(folds, blockPos, region.startLine)
    && line > region.startLine
    && line < region.endLine)

const buildDecorations = (doc: ProseNode, folds: readonly FoldMark[]): DecorationSet => {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block' || isMermaid(node.attrs.language)) return
    const text = node.textContent
    const regions = foldRegions(text)
    const kind = structuredKind(String(node.attrs.language ?? ''), text)
    if (!kind && regions.length === 0) return false
    decorations.push(Decoration.widget(pos + 1, (widgetView, getPos) => createToolbar(widgetView, getPos, node, regions), {
      side: -1,
      ignoreSelection: true,
      stopEvent: (event) => event.target instanceof Element && Boolean(event.target.closest('.structured-code-tools')),
    }))
    regions.forEach((region) => {
      if (coveredByFold(regions, folds, pos, region.startLine)) return
      const folded = isFolded(folds, pos, region.startLine)
      const hiddenFrom = lineOffset(text, region.startLine + 1)
      const hiddenTo = lineOffset(text, region.endLine)
      if (folded && hiddenTo > hiddenFrom && node.childCount <= 1) {
        const from = pos + 1 + hiddenFrom
        const to = pos + 1 + hiddenTo
        const $from = doc.resolve(from)
        const $to = doc.resolve(to)
        if ($from.parent === $to.parent && $from.parent.type.name === 'code_block') {
          decorations.push(Decoration.inline(from, to, { class: 'code-fold-hidden' }))
        }
      }
      decorations.push(Decoration.widget(pos + 1 + lineOffset(text, region.startLine), (widgetView, getPos) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'code-fold-toggle'
        const hiddenLines = Math.max(1, region.endLine - region.startLine - 1)
        button.textContent = folded ? `▸ ${region.label} · ${hiddenLines} 行` : '▾'
        button.setAttribute('aria-label', folded ? `展开 ${region.label}` : `折叠 ${region.label}`)
        button.addEventListener('mousedown', (event) => {
          event.preventDefault()
          event.stopPropagation()
          if (widgetView.isDestroyed) return
          const current = blockFromWidget(widgetView, getPos)
          if (!current) return
          const at = getPos()
          if (typeof at !== 'number') return
          const startLine = current.node.textContent.slice(0, at - (current.pos + 1)).split('\n').length - 1
          widgetView.dispatch(widgetView.state.tr.setMeta(structuredCodeKey, {
            toggle: { pos: current.pos, startLine },
          }))
        })
        return button
      }, {
        side: -1,
        ignoreSelection: true,
        stopEvent: (event) => event.target instanceof Element && Boolean(event.target.closest('.code-fold-toggle')),
      }))
    })
    return false
  })
  return DecorationSet.create(doc, decorations)
}

const applyMeta = (doc: ProseNode, folds: FoldMark[], meta: StructuredMeta | undefined): FoldMark[] => {
  if (!meta) return folds
  if (meta.toggle) {
    const node = doc.nodeAt(meta.toggle.pos)
    const signature = node && node.type.name === 'code_block' ? textSignature(node.textContent) : ''
    return toggleFold(folds, meta.toggle.pos, meta.toggle.startLine, signature)
  }
  if (meta.mode === 'expand-all' && typeof meta.pos === 'number') {
    return folds.filter((fold) => fold.pos !== meta.pos)
  }
  if (meta.mode === 'fold-all' && typeof meta.pos === 'number') {
    const node = doc.nodeAt(meta.pos)
    if (!node) return folds.filter((fold) => fold.pos !== meta.pos)
    const kept = folds.filter((fold) => fold.pos !== meta.pos)
    const signature = textSignature(node.textContent)
    return kept.concat(foldRegions(node.textContent).map((region) => ({
      pos: meta.pos as number,
      startLine: region.startLine,
      signature,
    })))
  }
  return folds
}

let expandingFold = false

export const structuredCodePlugin = new Plugin({
  key: structuredCodeKey,
  state: {
    init: (_config, state): StructuredState => ({
      decorations: buildDecorations(state.doc, []),
      folds: [],
    }),
    apply(tr, prev): StructuredState {
      const previous = prev as StructuredState
      const meta = tr.getMeta(structuredCodeKey) as StructuredMeta | undefined
      const folds = applyMeta(tr.doc, mapFolds(previous.folds, tr), meta)
      if (tr.getMeta(streamInsertKey)) {
        return { decorations: previous.decorations.map(tr.mapping, tr.doc), folds }
      }
      if (!meta && !tr.docChanged && !tr.getMeta(viewportChangedKey)) {
        return { decorations: previous.decorations.map(tr.mapping, tr.doc), folds }
      }
      if (tr.docChanged && !meta && !tr.getMeta(viewportChangedKey)) {
        const info = analyzeDecorationChange(tr)
        if (info.blockAt !== 'code_block' && !info.sliceBlocks.has('code_block')) {
          return { decorations: previous.decorations.map(tr.mapping, tr.doc), folds }
        }
      }
      return { decorations: buildDecorations(tr.doc, folds), folds }
    },
  },
  props: {
    decorations: (state) => (structuredCodeKey.getState(state) as StructuredState | undefined)?.decorations,
  },
  view: () => ({
    update(view) {
      if (expandingFold || view.isDestroyed) return
      const pluginState = structuredCodeKey.getState(view.state) as StructuredState | undefined
      if (!pluginState || pluginState.folds.length === 0) return
      const selection = view.state.selection.from
      for (const fold of pluginState.folds) {
        const node = view.state.doc.nodeAt(fold.pos)
        if (!node) continue
        const region = foldRegions(node.textContent).find((item) => item.startLine === fold.startLine)
        if (!region) continue
        const from = fold.pos + 1 + lineOffset(node.textContent, region.startLine + 1)
        const to = fold.pos + 1 + lineOffset(node.textContent, region.endLine)
        if (selection < from || selection >= to) continue
        expandingFold = true
        try {
          view.dispatch(view.state.tr.setMeta(structuredCodeKey, { toggle: { pos: fold.pos, startLine: fold.startLine } }))
        } finally {
          expandingFold = false
        }
        return
      }
    },
  }),
})
