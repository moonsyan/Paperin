import { useEffect, useImperativeHandle, useRef, type ForwardedRef, type MutableRefObject, type RefObject } from 'react'
import {
  Editor as MilkdownCore,
  EditorStatus,
  editorStateOptionsCtx,
  editorViewCtx,
  parserCtx,
  prosePluginsCtx,
  schemaCtx,
  type CmdKey,
} from '@milkdown/kit/core'
import { Slice, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { callCommand, getHTML, getMarkdown, insert } from '@milkdown/kit/utils'
import { createSearchController } from '../searchController'
import { refreshViewportRange, viewportChangedKey } from '../viewport/editorViewport'
import { sectionFoldKey } from '../plugins/sectionFold'
import { convertWikiTextInDoc } from '../plugins/wikiLink'
import { ensureFootnoteDefinitions } from '../../../lib/footnote-normalize'
import { createEditorAdapter } from '../adapter/editor-adapter'
import type { EditorCommand, EditorSubscription } from '../adapter/editor-adapter'
import type { EditorHandle, EditorProps } from '../editor-types'
import { blockAnchorFor, positionForBlockAnchor, positionForSourceLine } from './editor-doc-position'
import {
  applyViewState,
  captureViewState,
  focusDocEnd,
  focusEditorRoot,
  focusPosition,
  restoreScrollTop,
} from './editor-view-state'
import {
  buildPreviewHtml,
  ensureRichContentRendered,
  restoreExportViewport,
} from '../viewport/editor-export-snapshot'
import { collectAllHeadings } from '../navigation/editorHeadings'
import { useStreamingReplace } from './useStreamingReplace'
import { runEditorCommand } from '../adapter/editor-commands'

interface UseEditorContentReplacementOptions {
  ref: ForwardedRef<EditorHandle>
  editorRef: MutableRefObject<MilkdownCore | null>
  containerRef: RefObject<HTMLDivElement>
  dirtyRef: MutableRefObject<boolean>
  streamingRef: MutableRefObject<boolean>
  abortStreamRef: MutableRefObject<boolean>
  streamGenerationRef: MutableRefObject<number>
  notifyRef: MutableRefObject<EditorProps['onNotify']>
  resetOverlays: () => void
  subscription: EditorSubscription
}

interface UseEditorContentReplacementResult {
  handleCompositionEnd: () => void
  restoreExportViewport: (view?: EditorView) => void
}

/** 超过此长度的 Markdown 走分块流式替换，避免一次性事务卡死主线程。 */
const LARGE_DOCUMENT_CHARS = 200_000

/**
 * 正文替换与对外句柄装配。
 *
 * 职责边界：Markdown → ProseMirror 文档的整篇替换（同步/流式两条链路）、
 * IME 组合期延迟、替换后插件状态收尾、EditorHandle 门面装配。
 * 不包含：位置换算（editor-doc-position）、视图状态存取（editor-view-state）、
 * 导出快照（editor-export-snapshot）、流式调度细节（useStreamingReplace）。
 */
export const useEditorContentReplacement = ({
  ref,
  editorRef,
  containerRef,
  dirtyRef,
  streamingRef,
  abortStreamRef,
  streamGenerationRef,
  notifyRef,
  resetOverlays,
  subscription,
}: UseEditorContentReplacementOptions): UseEditorContentReplacementResult => {
  /** IME 组合期间多次替换只保留最后一次，组合结束后再执行。 */
  const pendingReplaceRef = useRef<(() => void) | null>(null)

  const getReadyEditor = (): MilkdownCore | null =>
    editorRef.current?.status === EditorStatus.Created ? editorRef.current : null

  /** 取当前可安全 dispatch 的 view：编辑器已销毁或 ctx 已清空时返回 null。 */
  const getLiveView = (): EditorView | null => {
    const editor = getReadyEditor()
    if (!editor) return null
    try {
      const view = editor.ctx.get(editorViewCtx)
      return view.isDestroyed ? null : view
    } catch {
      return null
    }
  }

  const { streamReplace, cancelStream } = useStreamingReplace({
    containerRef,
    streamingRef,
    abortStreamRef,
    streamGenerationRef,
    getLiveView,
  })

  const handleCompositionEnd = (): void => {
    const run = pendingReplaceRef.current
    if (!run) return
    pendingReplaceRef.current = null
    // PM 自身绑定在可编辑元素上的 compositionend（读取 DOM 差量收尾组合）
    // 晚于本容器的捕获监听；此处若同步执行排队的整篇替换，PM 会拿旧 DOM
    // 对替换后的新 doc 做差量，把刚上屏的组合文本重复写进新文档。
    // 推迟一拍并确认组合彻底结束后再执行。
    window.setTimeout(() => {
      const view = getReadyEditor()?.ctx.get(editorViewCtx)
      if (view?.composing) {
        window.setTimeout(run, 0)
        return
      }
      run()
    }, 0)
  }

  useEffect(() => {
    const root = containerRef.current
    if (!root) return
    root.addEventListener('compositionend', handleCompositionEnd, true)
    return () => root.removeEventListener('compositionend', handleCompositionEnd, true)
    // containerRef 引用稳定，挂载期绑定一次即可；handleCompositionEnd 读 ref 无闭包过期问题
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 对外统一入口：未传 view 时自行解析当前 view（可能为 null）。 */
  const releaseExportViewport = (view?: EditorView): void => {
    restoreExportViewport(view ?? getLiveView())
  }

  /** 文档整体替换后的统一收尾，确保两条替换链路行为一致。 */
  const finalizeReplace = (view: EditorView, flush: boolean): void => {
    if (view.isDestroyed) return
    releaseExportViewport(view)
    refreshViewportRange()
    view.dispatch(view.state.tr.setMeta(viewportChangedKey, true))
    convertWikiTextInDoc(view)
    view.dispatch(view.state.tr.setMeta(sectionFoldKey, { reset: true }))
    resetOverlays()
    if (flush) dirtyRef.current = false
  }

  /** 小文档同步替换：flush 重建 EditorState，保历史则整篇 replace + 块锚点恢复光标。 */
  const replaceSmallDoc = (
    editor: MilkdownCore,
    view: EditorView,
    document: ProseNode,
    restore: number | undefined,
    restoreScroll: number | undefined,
    flush: boolean,
  ): void => {
    if (flush) {
      const schema = editor.ctx.get(schemaCtx)
      const newOptions = editor.ctx.get(editorStateOptionsCtx)({
        schema,
        doc: document,
        plugins: editor.ctx.get(prosePluginsCtx),
      })
      view.updateState(EditorState.create(newOptions))
    } else {
      // 整篇 ReplaceStep 的位置映射恒指向新内容末尾，光标恢复改用块锚点
      const anchor = restore !== undefined ? blockAnchorFor(view.state.doc, restore) : null
      const transaction = view.state.tr.replace(
        0,
        view.state.doc.content.size,
        new Slice(document.content, 0, 0),
      )
      if (anchor) {
        const from = positionForBlockAnchor(transaction.doc, anchor)
        transaction.setSelection(TextSelection.near(transaction.doc.resolve(from)))
      }
      view.dispatch(transaction)
      if (restoreScroll !== undefined) restoreScrollTop(containerRef.current, restoreScroll)
    }
  }

  const applyReplaceContent = (
    markdown: string,
    flush: boolean,
    restore?: number,
    onComplete?: () => void,
    restoreScroll?: number,
  ): void => {
    const editor = getReadyEditor()
    if (!editor) {
      onComplete?.()
      return
    }
    const view = editor.ctx.get(editorViewCtx)
    if (view.isDestroyed) {
      onComplete?.()
      return
    }
    let document: ProseNode | null
    try {
      // 切换文档/重载内容时也要为孤立脚注引用补占位定义（与首次创建编辑器
      // 的 defaultValueCtx 走同一入口），否则 gfm 解析会把 [^label] 留作字面文本。
      document = editor.ctx.get(parserCtx)(ensureFootnoteDefinitions(markdown))
    } catch {
      resetOverlays()
      notifyRef.current?.('内容无法解析，已保留原文档')
      onComplete?.()
      return
    }
    if (!document) {
      onComplete?.()
      return
    }
    if (streamingRef.current) {
      cancelStream()
      streamGenerationRef.current++
      streamingRef.current = false
    }
    if (markdown.length <= LARGE_DOCUMENT_CHARS) {
      replaceSmallDoc(editor, view, document, restore, restoreScroll, flush)
      finalizeReplace(view, flush)
      onComplete?.()
      return
    }
    streamReplace({
      editor,
      view,
      document,
      restorePosition: restore,
      restoreScroll,
      flush,
      onDone: () => {
        finalizeReplace(view, flush)
        onComplete?.()
      },
    })
  }

  const replaceWhenNotComposing = (run: () => void): void => {
    const editor = getReadyEditor()
    if (!editor) return
    if (editor.ctx.get(editorViewCtx).composing) {
      pendingReplaceRef.current = run
      return
    }
    run()
  }

  useImperativeHandle(ref, () => {
    const searchController = createSearchController(() => {
      const editor = getReadyEditor()
      return editor ? editor.ctx.get(editorViewCtx) : null
    })

    const replaceContent = (markdown: string, onComplete?: () => void): void => {
      replaceWhenNotComposing(() => applyReplaceContent(markdown, true, undefined, onComplete))
    }
    const runMilkdownCommand = <T,>(key: CmdKey<T>, payload?: T): boolean => {
      const editor = getReadyEditor()
      if (!editor) return false
      return editor.action(callCommand(key, payload))
    }

    return {
      ...createEditorAdapter(
        () => getReadyEditor()?.action(getMarkdown()) ?? null,
        replaceContent,
        () => focusEditorRoot(containerRef.current),
        (command: EditorCommand) => runEditorCommand(command, runMilkdownCommand),
        subscription,
      ),
      replaceContent,
      updateContentPreservingHistory: (markdown) => {
        replaceWhenNotComposing(() => {
          const view = getLiveView()
          if (!view) return
          const previousSelection = view.state.selection.from
          // 滚动恢复交给 applyReplaceContent：小文档替换后、大文档流式完成后
          // 各在合适时机恢复，避免流式过程中提前恢复导致跳动。
          const previousScroll = captureViewState(view, containerRef.current).scrollTop
          applyReplaceContent(markdown, false, previousSelection, undefined, previousScroll)
        })
      },
      consumeDirtyChange: () => {
        const changed = dirtyRef.current
        dirtyRef.current = false
        return changed
      },
      getViewState: () => {
        const view = getLiveView()
        return view ? captureViewState(view, containerRef.current) : null
      },
      restoreViewState: (state) => {
        const view = getLiveView()
        if (view) applyViewState(view, containerRef.current, state)
      },
      insertMd: (markdown) => {
        getReadyEditor()?.action(insert(markdown))
      },
      runMilkdownCommand,
      getHtml: () => getReadyEditor()?.action(getHTML()) ?? '',
      getHeadings: () => {
        const view = getLiveView()
        return view ? collectAllHeadings(view.state.doc) : []
      },
      getPreviewHtml: () => {
        const view = getLiveView()
        if (!view) {
          releaseExportViewport()
          return ''
        }
        return buildPreviewHtml(view, releaseExportViewport)
      },
      focusEnd: () => {
        const view = getLiveView()
        if (view) focusDocEnd(view)
      },
      focusLine: (line: number) => {
        const view = getLiveView()
        if (view) focusPosition(view, positionForSourceLine(view.state.doc, line))
      },
      isReady: () => getReadyEditor() !== null,
      ensureRichContent: () => ensureRichContentRendered(getLiveView()),
      restoreExportViewport: () => {
        releaseExportViewport()
      },
      startSearch: searchController.start,
      searchNext: searchController.next,
      replaceCurrent: searchController.replaceCurrent,
      replaceAllMatches: searchController.replaceAll,
      endSearch: searchController.end,
    }
  })

  return {
    handleCompositionEnd,
    restoreExportViewport: releaseExportViewport,
  }
}
