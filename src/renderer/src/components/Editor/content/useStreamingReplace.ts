import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import {
  type Editor as MilkdownCore,
  prosePluginsCtx,
  schemaCtx,
} from '@milkdown/kit/core'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { streamInsertKey } from '../viewport/editorViewport'
import { blockAnchorFor, positionForBlockAnchor } from './editor-doc-position'
import { restoreScrollTop } from './editor-view-state'

/**
 * 大文档分块流式替换：把整篇插入切成多个事务，每批之间让出主线程，
 * 避免十万字级 Markdown 一次性 replace 造成秒级卡死。
 *
 * 职责边界：流的代次管理、用户输入中止、分块调度、光标/滚动收尾。
 * 不包含：Markdown 解析、小文档同步替换、替换后的插件状态重置（由调用方 finalize）。
 */

/** 每批插入的顶层块数；实测在 60fps 与总耗时之间的折中值。 */
const CHUNK_SIZE = 150

export interface StreamReplaceRequest {
  editor: MilkdownCore
  view: EditorView
  document: ProseNode
  /** 旧文档中要恢复的光标位置；undefined 表示不恢复（flush 场景保持默认选区）。 */
  restorePosition?: number
  restoreScroll?: number
  /** true 表示重建 EditorState（清空撤销栈）；false 保留历史与插件状态。 */
  flush: boolean
  onDone: () => void
}

interface UseStreamingReplaceOptions {
  containerRef: RefObject<HTMLDivElement>
  streamingRef: MutableRefObject<boolean>
  abortStreamRef: MutableRefObject<boolean>
  streamGenerationRef: MutableRefObject<number>
  getLiveView: () => EditorView | null
}

interface UseStreamingReplaceResult {
  streamReplace: (request: StreamReplaceRequest) => void
  cancelStream: () => void
}

export const useStreamingReplace = ({
  containerRef,
  streamingRef,
  abortStreamRef,
  streamGenerationRef,
  getLiveView,
}: UseStreamingReplaceOptions): UseStreamingReplaceResult => {
  /** 排队中的 idle/timeout 句柄；卸载或被新替换取代时取消。 */
  const streamTimerRef = useRef<{ cancel: () => void } | null>(null)

  const cancelStream = (): void => {
    streamTimerRef.current?.cancel()
    streamTimerRef.current = null
  }

  // 卸载清理：取消排队的流式回调并作废当前代次，
  // 防止回调在组件卸载、编辑器销毁后继续 dispatch 抛错。
  useEffect(() => {
    return () => {
      cancelStream()
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

  /**
   * flush 场景重建 EditorState 清空历史；保历史场景改用带 streamInsertKey 的
   * 删除事务清空文档，否则每次保存回写都会清掉撤销栈并重置折叠/搜索等插件状态。
   * 返回是否使用了占位段落（schema 不允许空 doc 时），供收尾时清理。
   */
  const clearDocument = (
    editor: MilkdownCore,
    view: EditorView,
    flush: boolean,
  ): boolean => {
    const schema = editor.ctx.get(schemaCtx)
    if (!flush) {
      const clear = view.state.tr.delete(0, view.state.doc.content.size)
      clear.setMeta(streamInsertKey, true)
      view.dispatch(clear)
      return false
    }
    const plugins = editor.ctx.get(prosePluginsCtx)
    let emptyDocument: ProseNode
    let usedPlaceholder = false
    try {
      emptyDocument = schema.node('doc', null, [])
    } catch {
      usedPlaceholder = true
      emptyDocument = schema.node('doc', null, [schema.nodes.paragraph.create()])
    }
    view.updateState(EditorState.create({ schema, doc: emptyDocument, plugins }))
    return usedPlaceholder
  }

  const streamReplace = ({
    editor,
    view,
    document,
    restorePosition,
    restoreScroll,
    flush,
    onDone,
  }: StreamReplaceRequest): void => {
    const generation = ++streamGenerationRef.current
    streamingRef.current = true
    abortStreamRef.current = false
    // 光标锚点在清空文档前按旧 doc 计算
    const cursorAnchor =
      restorePosition !== undefined ? blockAnchorFor(view.state.doc, restorePosition) : null
    const usedPlaceholder = clearDocument(editor, view, flush)

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
        cancelStream()
        step()
      }
    }
    const detachStreamGuards = (): void => {
      view.dom.removeEventListener('keydown', onUserInputAttempt, true)
      view.dom.removeEventListener('compositionstart', onUserInputAttempt, true)
      view.dom.removeEventListener('paste', onUserInputAttempt, true)
    }
    view.dom.addEventListener('keydown', onUserInputAttempt, true)
    view.dom.addEventListener('compositionstart', onUserInputAttempt, true)
    view.dom.addEventListener('paste', onUserInputAttempt, true)

    const total = document.childCount
    let index = 0

    const finish = (): void => {
      const stale = generation !== streamGenerationRef.current
      streamingRef.current = false
      detachStreamGuards()
      if (stale) return
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
      if (restoreScroll !== undefined) restoreScrollTop(containerRef.current, restoreScroll)
      onDone()
    }

    const insertRange = (currentView: EditorView, end: number): void => {
      const nodes: ProseNode[] = []
      for (; index < end; index++) nodes.push(document.child(index))
      if (nodes.length === 0) return
      const transaction = currentView.state.tr.insert(currentView.state.doc.content.size, nodes)
      transaction.setMeta(streamInsertKey, true)
      currentView.dispatch(transaction)
    }

    const drainRemaining = (currentView: EditorView): void => {
      if (index >= total) return
      insertRange(currentView, total)
    }

    const step = (): void => {
      streamTimerRef.current = null
      if (generation !== streamGenerationRef.current) return
      const currentView = getLiveView()
      if (!currentView) {
        streamingRef.current = false
        return
      }
      if (abortStreamRef.current) {
        drainRemaining(currentView)
        finish()
        return
      }
      insertRange(currentView, Math.min(index + CHUNK_SIZE, total))
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

  return { streamReplace, cancelStream }
}
