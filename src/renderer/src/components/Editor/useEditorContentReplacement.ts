import {
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
  type MutableRefObject,
  type RefObject,
} from 'react'
import {
  Editor as MilkdownCore,
  EditorStatus,
  editorStateOptionsCtx,
  editorViewCtx,
  parserCtx,
  prosePluginsCtx,
  schemaCtx,
} from '@milkdown/kit/core'
import { Slice, type Node as ProseNode } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { callCommand, getHTML, getMarkdown, insert } from '@milkdown/kit/utils'
import { createSearchController } from './searchController'
import {
  refreshViewportRange,
  restoreFullRangeOverride,
  setFullRangeOverride,
  streamInsertKey,
  viewportChangedKey,
} from './editorViewport'
import {
  ensureMermaidRendered,
  shouldRemoveMermaidSource,
} from './plugins/mermaidCodeBlock'
import { sectionFoldKey } from './plugins/sectionFold'
import { convertWikiTextInDoc } from './plugins/wikiLink'
import { ensureFootnoteDefinitions } from '../../lib/footnote-normalize'
import type { EditorHandle, EditorProps } from './editor-types'

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
}

interface UseEditorContentReplacementResult {
  handleCompositionEnd: () => void
  restoreExportViewport: (view?: EditorView) => void
}

/**
 * 顶层块锚点：整篇替换的 ReplaceStep 会把旧文档内部位置恒映射到新内容
 * 末尾（StepMap 语义），mapping 恢复光标必然落到文档尾。改用
 * "第 N 个顶层块 + 块内偏移"跨替换锚定——frontmatter 编辑、排版修复、
 * 版本恢复等整篇替换后光标仍落在原内容附近。
 */
interface BlockAnchor {
  blockIndex: number
  offsetInBlock: number
}

const blockAnchorFor = (doc: ProseNode, pos: number): BlockAnchor => {
  let blockIndex = 0
  let result: BlockAnchor = { blockIndex: 0, offsetInBlock: 0 }
  let done = false
  doc.forEach((node, offset) => {
    if (done) return
    const contentStart = offset + 1
    if (pos >= contentStart && pos <= offset + node.nodeSize - 1) {
      result = {
        blockIndex,
        offsetInBlock: Math.max(0, Math.min(pos - contentStart, node.content.size)),
      }
      done = true
    } else if (pos <= offset) {
      // 位置在块边界上（如文档开头）：锚定到当前块起始
      result = { blockIndex, offsetInBlock: 0 }
      done = true
    }
    blockIndex++
  })
  if (!done) {
    // 位置越过所有块（文档尾）：锚定末块尾
    result = { blockIndex: Math.max(0, doc.childCount - 1), offsetInBlock: Number.MAX_SAFE_INTEGER }
  }
  return result
}

const positionForBlockAnchor = (doc: ProseNode, anchor: BlockAnchor): number => {
  let index = 0
  let result: number | null = null
  doc.forEach((node, offset) => {
    if (result !== null) return
    if (index === anchor.blockIndex) {
      result = Math.min(offset + 1 + anchor.offsetInBlock, offset + node.nodeSize - 1)
    }
    index++
  })
  if (result === null) {
    // 新文档块数更少：钳到文档尾
    result = Math.max(0, doc.content.size - 1)
  }
  return Math.max(0, result)
}

/**
 * 估算一个节点在 Markdown 源中占用的行数（focusLine 定位用）：
 * 文本节点按换行拆分；块级子节点各自独立计行；硬换行计入 1 行；
 * frontmatter 补上下一两行围栏。块间空行由调用方在块与块之间补计。
 */
const sourceLineCount = (node: ProseNode): number => {
  if (node.isText) return (node.text ?? '').split('\n').length
  if (node.type.name === 'hardbreak') return 1
  let lines = 0
  node.forEach((child) => {
    lines += sourceLineCount(child)
  })
  if (node.type.name === 'frontmatter') lines += 2
  return Math.max(1, lines)
}

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
}: UseEditorContentReplacementOptions): UseEditorContentReplacementResult => {
  /** IME 组合期间多次替换只保留最后一次，组合结束后再执行。 */
  const pendingReplaceRef = useRef<(() => void) | null>(null)
  /** 流式替换排队中的 idle/timeout 句柄，卸载或被新替换取代时取消。 */
  const streamTimerRef = useRef<{ cancel: () => void } | null>(null)

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

  const cancelStreamTimer = (): void => {
    streamTimerRef.current?.cancel()
    streamTimerRef.current = null
  }

  // 卸载清理：取消排队的流式回调并作废当前代次，
  // 防止回调在组件卸载、编辑器销毁后继续 dispatch 抛错。
  useEffect(() => {
    return () => {
      cancelStreamTimer()
      if (streamingRef.current) {
        // 故意在卸载时读取最新代次：卸载是终态，此刻的值才是要作废的目标；
        // 规则建议的"提前拷贝"反而会作废旧代次，属于误报
        // eslint-disable-next-line react-hooks/exhaustive-deps
        streamGenerationRef.current++
        streamingRef.current = false
      }
    }
    // refs 由父级传入且引用稳定；卸载清理只关心终态值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const restoreExportViewport = (view?: EditorView): void => {
    if (!restoreFullRangeOverride()) return
    const currentView = view ?? getReadyEditor()?.ctx.get(editorViewCtx)
    if (!currentView || currentView.isDestroyed) return
    refreshViewportRange()
    currentView.dispatch(currentView.state.tr.setMeta(viewportChangedKey, true))
  }

  /** 文档整体替换后的统一收尾，确保两条替换链路行为一致。 */
  const finalizeReplace = (view: EditorView, flush: boolean): void => {
    if (view.isDestroyed) return
    restoreExportViewport(view)
    refreshViewportRange()
    view.dispatch(view.state.tr.setMeta(viewportChangedKey, true))
    convertWikiTextInDoc(view)
    view.dispatch(view.state.tr.setMeta(sectionFoldKey, { reset: true }))
    resetOverlays()
    if (flush) dirtyRef.current = false
  }

  /**
   * 大文档按顶层块分段插入，让每批事务之间释放主线程。
   * flush 场景重建 EditorState（清空历史）；保历史场景改用带
   * streamInsertKey 的删除事务清空文档，否则每次保存回写都会
   * 清掉撤销栈并重置折叠/搜索等插件状态。
   */
  const streamReplaceLargeDoc = (
    editor: MilkdownCore,
    view: EditorView,
    fullDocument: ProseNode,
    restore: number | undefined,
    restoreScroll: number | undefined,
    flush: boolean,
    onDone: () => void,
  ): void => {
    const schema = editor.ctx.get(schemaCtx)
    let usedPlaceholder = false
    const generation = ++streamGenerationRef.current
    streamingRef.current = true
    abortStreamRef.current = false
    // 光标锚点在清空文档前按旧 doc 计算
    const cursorAnchor = restore !== undefined ? blockAnchorFor(view.state.doc, restore) : null
    // 流式插入期间的输入保护：用户击键/粘贴/IME 组合开始时，立即中止流并
    // 同步补完剩余块——让本次输入作用在完整新文档上，而不是被 stream-guard
    // filterTransaction 静默丢弃（丢弃的事务不进任何插件 apply，无法挽回）
    const onUserInputAttempt = (): void => {
      if (generation !== streamGenerationRef.current) {
        // 已被更新的替换取代：本次流已作废，摘掉残留监听
        detachStreamGuards()
        return
      }
      if (!streamingRef.current) return
      abortStreamRef.current = true
      if (streamTimerRef.current !== null) {
        cancelStreamTimer()
        step()
      }
    }
    view.dom.addEventListener('keydown', onUserInputAttempt, true)
    view.dom.addEventListener('compositionstart', onUserInputAttempt, true)
    view.dom.addEventListener('paste', onUserInputAttempt, true)
    const detachStreamGuards = (): void => {
      view.dom.removeEventListener('keydown', onUserInputAttempt, true)
      view.dom.removeEventListener('compositionstart', onUserInputAttempt, true)
      view.dom.removeEventListener('paste', onUserInputAttempt, true)
    }
    if (flush) {
      const plugins = editor.ctx.get(prosePluginsCtx)
      let emptyDocument: ProseNode
      try {
        emptyDocument = schema.node('doc', null, [])
      } catch {
        usedPlaceholder = true
        emptyDocument = schema.node('doc', null, [schema.nodes.paragraph.create()])
      }
      view.updateState(EditorState.create({ schema, doc: emptyDocument, plugins }))
    } else {
      const clear = view.state.tr.delete(0, view.state.doc.content.size)
      clear.setMeta(streamInsertKey, true)
      view.dispatch(clear)
    }

    const total = fullDocument.childCount
    const chunkSize = 150
    let index = 0

    const finish = () => {
      if (generation !== streamGenerationRef.current) {
        streamingRef.current = false
        detachStreamGuards()
        return
      }
      streamingRef.current = false
      detachStreamGuards()
      const currentView = getLiveView()
      if (!currentView) return
      if (usedPlaceholder) {
        const first = currentView.state.doc.firstChild
        if (
          first &&
          first.isTextblock &&
          first.textContent === '' &&
          currentView.state.doc.childCount > 1
        ) {
          currentView.dispatch(currentView.state.tr.delete(0, first.nodeSize))
        }
      }
      // 非 flush：按块锚点把光标恢复到原内容附近（旧位置经整篇替换的映射
      // 必然指向文档尾）；flush：保持 updateState 的默认选区，不做额外跳转。
      if (cursorAnchor) {
        const from = positionForBlockAnchor(currentView.state.doc, cursorAnchor)
        try {
          currentView.dispatch(
            currentView.state.tr.setSelection(
              TextSelection.near(currentView.state.doc.resolve(from)),
            ),
          )
        } catch {
          // 文档结构变化使位置不可用时保持默认选区。
        }
      }
      if (restoreScroll !== undefined) {
        const scrollParent = containerRef.current?.querySelector<HTMLElement>('.editor-scroll')
        if (scrollParent) {
          requestAnimationFrame(() => {
            scrollParent.scrollTop = restoreScroll
          })
        }
      }
      onDone()
    }

    const drainRemaining = (currentView: EditorView) => {
      if (index >= total) return
      const nodes: ProseNode[] = []
      for (; index < total; index++) nodes.push(fullDocument.child(index))
      const transaction = currentView.state.tr.insert(currentView.state.doc.content.size, nodes)
      transaction.setMeta(streamInsertKey, true)
      currentView.dispatch(transaction)
    }

    const step = () => {
      streamTimerRef.current = null
      if (generation !== streamGenerationRef.current) return
      if (abortStreamRef.current) {
        const currentView = getLiveView()
        if (!currentView) {
          streamingRef.current = false
          return
        }
        drainRemaining(currentView)
        finish()
        return
      }
      const currentView = getLiveView()
      if (!currentView) {
        streamingRef.current = false
        return
      }
      const end = Math.min(index + chunkSize, total)
      const nodes: ProseNode[] = []
      for (; index < end; index++) nodes.push(fullDocument.child(index))
      if (nodes.length === 0) {
        finish()
        return
      }
      const transaction = currentView.state.tr.insert(currentView.state.doc.content.size, nodes)
      transaction.setMeta(streamInsertKey, true)
      currentView.dispatch(transaction)
      if (index >= total) {
        finish()
        return
      }
      if (typeof requestIdleCallback === 'function') {
        const handle = requestIdleCallback(step, { timeout: 60 })
        streamTimerRef.current = { cancel: () => cancelIdleCallback(handle) }
        return
      }
      const handle = setTimeout(step, 0)
      streamTimerRef.current = { cancel: () => clearTimeout(handle) }
    }
    step()
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
      cancelStreamTimer()
      streamGenerationRef.current++
      streamingRef.current = false
    }
    const isLargeDocument = markdown.length > 200_000
    if (!isLargeDocument) {
      if (flush) {
        const schema = editor.ctx.get(schemaCtx)
        const newOptions = editor.ctx.get(editorStateOptionsCtx)({
          schema,
          doc: document,
          plugins: editor.ctx.get(prosePluginsCtx),
        })
        view.updateState(EditorState.create(newOptions))
      }
      if (!flush) {
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
        if (restoreScroll !== undefined) {
          const scrollParent = containerRef.current?.querySelector<HTMLElement>('.editor-scroll')
          if (scrollParent) {
            requestAnimationFrame(() => {
              scrollParent.scrollTop = restoreScroll
            })
          }
        }
      }
      finalizeReplace(view, flush)
      onComplete?.()
      return
    }
    streamReplaceLargeDoc(editor, view, document, restore, restoreScroll, flush, () => {
      finalizeReplace(view, flush)
      onComplete?.()
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

    return {
      replaceContent: (markdown, onComplete) => {
        replaceWhenNotComposing(() => applyReplaceContent(markdown, true, undefined, onComplete))
      },
      updateContentPreservingHistory: (markdown) => {
        replaceWhenNotComposing(() => {
          const editor = getReadyEditor()
          if (!editor) return
          const view = editor.ctx.get(editorViewCtx)
          const previousSelection = view.state.selection.from
          const scrollParent = containerRef.current?.querySelector<HTMLElement>('.editor-scroll')
          const previousScroll = scrollParent?.scrollTop ?? 0
          // 滚动恢复交给 applyReplaceContent：小文档替换后、大文档流式完成后
          // 各在合适时机恢复，避免流式过程中提前恢复导致跳动。
          applyReplaceContent(markdown, false, previousSelection, undefined, previousScroll)
        })
      },
      getMarkdown: () => {
        const editor = getReadyEditor()
        return editor ? editor.action(getMarkdown()) : null
      },
      consumeDirtyChange: () => {
        const changed = dirtyRef.current
        dirtyRef.current = false
        return changed
      },
      getViewState: () => {
        const editor = getReadyEditor()
        if (!editor) return null
        const view = editor.ctx.get(editorViewCtx)
        const scrollParent = containerRef.current?.querySelector<HTMLElement>('.editor-scroll')
        return {
          selection: {
            anchor: view.state.selection.anchor,
            head: view.state.selection.head,
          },
          scrollTop: scrollParent?.scrollTop ?? 0,
        }
      },
      restoreViewState: (state) => {
        const editor = getReadyEditor()
        if (!editor) return
        const view = editor.ctx.get(editorViewCtx)
        const maxPosition = view.state.doc.content.size
        const anchor = Math.min(maxPosition, Math.max(0, state.selection.anchor))
        const head = Math.min(maxPosition, Math.max(0, state.selection.head))
        try {
          const selection = TextSelection.between(
            view.state.doc.resolve(anchor),
            view.state.doc.resolve(head),
          )
          view.dispatch(view.state.tr.setSelection(selection))
        } catch {
          // 文档结构变化导致位置不可用时保留默认选区。
        }
        requestAnimationFrame(() => {
          const scrollParent = containerRef.current?.querySelector<HTMLElement>('.editor-scroll')
          if (scrollParent) scrollParent.scrollTop = Math.max(0, state.scrollTop)
        })
      },
      insertMd: (markdown) => {
        getReadyEditor()?.action(insert(markdown))
      },
      runCommand: (key, payload) => {
        const editor = getReadyEditor()
        if (!editor) return false
        return editor.action(callCommand(key, payload))
      },
      getHtml: () => getReadyEditor()?.action(getHTML()) ?? '',
      getHeadings: () => {
        const editor = getReadyEditor()
        if (!editor) return []
        const headings: { level: number; text: string }[] = []
        editor.ctx.get(editorViewCtx).state.doc.descendants((node) => {
          if (node.type.name === 'heading') {
            headings.push({ level: node.attrs.level as number, text: node.textContent })
          }
        })
        return headings
      },
      getPreviewHtml: () => {
        const editor = getReadyEditor()
        if (!editor) {
          restoreExportViewport()
          return ''
        }
        const view = editor.ctx.get(editorViewCtx)
        const clone = view.dom.cloneNode(true) as HTMLElement
        restoreExportViewport(view)
        clone.querySelectorAll('.search-hit').forEach((element) => {
          element.classList.remove('search-hit', 'current')
        })
        clone
          .querySelectorAll('.block-active, .bracket-match')
          .forEach((element) => element.classList.remove('block-active', 'bracket-match'))
        clone
          .querySelectorAll('.folded-hidden')
          .forEach((element) => element.classList.remove('folded-hidden'))
        clone
          .querySelectorAll('.code-line-numbers, .fold-toggle')
          .forEach((element) => element.remove())
        clone.querySelectorAll('.mermaid-toolbar').forEach((element) => element.remove())
        clone
          .querySelectorAll('.mermaid-block.is-editing-source')
          .forEach((element) => {
            if (element.querySelector('.mermaid-preview svg')) {
              element.classList.remove('is-editing-source')
            }
          })
        clone.querySelectorAll('pre[data-language]').forEach((element) => {
          if (element.getAttribute('data-language')?.trim().toLowerCase() !== 'mermaid') return
          const previous = element.previousElementSibling
          const isMermaidBlock =
            previous instanceof Element && previous.classList.contains('mermaid-block')
          const removeSource = shouldRemoveMermaidSource(
            isMermaidBlock,
            isMermaidBlock && previous.classList.contains('is-editing-source'),
            isMermaidBlock && Boolean(previous.querySelector('.mermaid-preview svg')),
          )
          if (removeSource) element.remove()
        })
        return clone.innerHTML
      },
      focus: () => {
        containerRef.current?.querySelector<HTMLElement>('.milkdown .editor')?.focus()
      },
      focusEnd: () => {
        const editor = getReadyEditor()
        if (!editor) return
        const view = editor.ctx.get(editorViewCtx)
        const { state, dispatch } = view
        dispatch(state.tr.setSelection(TextSelection.atEnd(state.doc)).scrollIntoView())
        view.focus()
      },
      focusLine: (line: number) => {
        const editor = getReadyEditor()
        if (!editor) return
        const view = editor.ctx.get(editorViewCtx)
        if (!Number.isFinite(line) || line < 1) return
        const doc = view.state.doc
        // 顶层块粒度定位（与质量诊断/大纲的 Markdown 源行同源）：
        // 不能用 descendants 累加——容器节点与其子块、段落与其文本节点
        // 会被重复计数，块间空行与 frontmatter 围栏也不在 textContent 里
        let cursor = 1
        let bestPos: number | null = null
        doc.forEach((node, offset) => {
          if (bestPos !== null) return
          if (cursor >= line) {
            bestPos = offset + 1
            return
          }
          // 块之间在源码中至少相隔一个空行
          cursor += sourceLineCount(node) + 1
          if (cursor >= line) bestPos = offset + 1
        })
        const pos = bestPos ?? doc.content.size
        view.dispatch(view.state.tr.setSelection(TextSelection.near(doc.resolve(pos))).scrollIntoView())
        view.focus()
      },
      isReady: () => getReadyEditor() !== null,
      ensureRichContent: async () => {
        setFullRangeOverride(true)
        const editor = getReadyEditor()
        if (editor?.status === EditorStatus.Created) {
          const view = editor.ctx.get(editorViewCtx)
          view.dispatch(view.state.tr.setMeta(viewportChangedKey, true))
        }
        try {
          await ensureMermaidRendered()
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        } catch (error) {
          restoreExportViewport()
          throw error
        }
      },
      restoreExportViewport: () => {
        restoreExportViewport()
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
    restoreExportViewport,
  }
}
