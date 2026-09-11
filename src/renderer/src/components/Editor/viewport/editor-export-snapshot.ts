import type { EditorView } from '@milkdown/kit/prose/view'
import {
  refreshViewportRange,
  restoreFullRangeOverride,
  setFullRangeOverride,
  viewportChangedKey,
} from './editorViewport'
import { ensureMermaidRendered, shouldRemoveMermaidSource } from '../plugins/mermaidCodeBlock'

/**
 * 导出快照：把虚拟化渲染的编辑器临时展开为全文，产出可打印/可导出的 HTML，
 * 结束后释放全量覆盖让实时编辑回到按需渲染。
 * 不含 React；视口开关与 Mermaid 光栅化时序集中在此，避免各导出入口各写一套。
 */

/** 释放导出全量覆盖；返回是否真的做过释放（无覆盖时为 false）。 */
export const restoreExportViewport = (view: EditorView | null | undefined): boolean => {
  if (!restoreFullRangeOverride()) return false
  if (!view || view.isDestroyed) return false
  refreshViewportRange()
  view.dispatch(view.state.tr.setMeta(viewportChangedKey, true))
  return true
}

/** 进入导出态：要求渲染全文，并立即触发一次视口重算。 */
export const enterExportViewport = (view: EditorView | null | undefined): void => {
  setFullRangeOverride(true)
  if (!view || view.isDestroyed) return
  view.dispatch(view.state.tr.setMeta(viewportChangedKey, true))
}

/** 等待 Mermaid 等异步渲染落定；失败时回滚导出态再抛出，避免视口卡在全量。 */
export const ensureRichContentRendered = async (
  view: EditorView | null | undefined,
): Promise<void> => {
  enterExportViewport(view)
  try {
    await ensureMermaidRendered()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  } catch (error) {
    restoreExportViewport(view)
    throw error
  }
}

const stripOverlayClasses = (root: HTMLElement): void => {
  root.querySelectorAll('.search-hit').forEach((element) => {
    element.classList.remove('search-hit', 'current')
  })
  root
    .querySelectorAll('.block-active, .bracket-match')
    .forEach((element) => element.classList.remove('block-active', 'bracket-match'))
  root
    .querySelectorAll('.folded-hidden')
    .forEach((element) => element.classList.remove('folded-hidden'))
}

const stripEditorChrome = (root: HTMLElement): void => {
  root
    .querySelectorAll('.code-line-numbers, .fold-toggle')
    .forEach((element) => element.remove())
  root.querySelectorAll('.mermaid-toolbar').forEach((element) => element.remove())
  root.querySelectorAll('.mermaid-block.is-editing-source').forEach((element) => {
    if (element.querySelector('.mermaid-preview svg')) {
      element.classList.remove('is-editing-source')
    }
  })
}

/** Mermaid 源码块只在已有渲染图时移除，未渲染的源码必须保留以免丢内容。 */
const stripMermaidSources = (root: HTMLElement): void => {
  root.querySelectorAll('pre[data-language]').forEach((element) => {
    if (element.getAttribute('data-language')?.trim().toLowerCase() !== 'mermaid') return
    const previous = element.previousElementSibling
    const isMermaidBlock = previous instanceof Element && previous.classList.contains('mermaid-block')
    const removeSource = shouldRemoveMermaidSource(
      isMermaidBlock,
      isMermaidBlock && previous.classList.contains('is-editing-source'),
      isMermaidBlock && Boolean(previous.querySelector('.mermaid-preview svg')),
    )
    if (removeSource) element.remove()
  })
}

/**
 * 克隆当前 DOM 产出导出 HTML，随后调用 releaseViewport 释放全量渲染。
 * 顺序不可调换：先克隆才能拿到展开后的完整内容，再释放才不会把
 * 实时编辑器长期停在全量渲染上。
 */
export const buildPreviewHtml = (
  view: EditorView,
  releaseViewport: (view: EditorView) => void,
): string => {
  const clone = view.dom.cloneNode(true) as HTMLElement
  releaseViewport(view)
  stripOverlayClasses(clone)
  stripEditorChrome(clone)
  stripMermaidSources(clone)
  return clone.innerHTML
}
