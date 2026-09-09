import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type { EditorHandle } from '../components/Editor'

export interface UsePreviewSyncOptions {
  previewMode: boolean
  /** 活动文档内容（防抖刷新驱动：内容变化后 350ms 重建快照） */
  activeContent: string
  editorRef: MutableRefObject<EditorHandle | null>
  /** 编辑区容器（工作区根节点，用于查找 .editor-scroll） */
  editorAreaRef: RefObject<HTMLDivElement>
  /** 导出进行中：暂停预览刷新（快照依赖编辑区 DOM，与导出互斥） */
  isExportActive: () => boolean
}

export interface UsePreviewSyncActions {
  /** 预览内容容器（直接 DOM 注入，绕开 React 协调，大文档不触发全树重渲染） */
  previewContentRef: MutableRefObject<HTMLDivElement | null>
  /** 预览栏滚动容器 */
  previewPaneRef: MutableRefObject<HTMLDivElement | null>
  /** 富内容（KaTeX/Mermaid）渲染完成回调：立即刷新预览 */
  handleRichRender: () => void
}

/**
 * 分栏预览：编辑器 DOM 快照 → 预览栏（程序化滚动保持比例），
 * 编辑区 ↔ 预览区按比例同步滚动（rAF 节流 + 回显抑制）。
 */
export function usePreviewSync({
  previewMode,
  activeContent,
  editorRef,
  editorAreaRef,
  isExportActive,
}: UsePreviewSyncOptions): UsePreviewSyncActions {
  const previewContentRef = useRef<HTMLDivElement>(null)
  const previewPaneRef = useRef<HTMLDivElement>(null)
  /** renderPreview 程序化滚动标记：同步监听需吞掉该回显，避免反向拉动编辑区 */
  const previewProgScrollRef = useRef(false)

  /** 取编辑器 DOM 快照写入预览栏；前后保持滚动比例，内容刷新后不跳动 */
  const renderPreview = useCallback(() => {
    if (isExportActive()) return
    const pane = previewPaneRef.current
    const content = previewContentRef.current
    if (!pane || !content) return
    const max = pane.scrollHeight - pane.clientHeight
    const ratio = max > 0 ? pane.scrollTop / max : 0
    // 信任边界：内容来自 ProseMirror 编辑器自身 DOM（Markdown 经 schema 渲染，无原始 HTML 透传）。
    // 若未来引入用户可控的原始 HTML 渲染，此处必须先经 DOMPurify 清理再注入。
    content.innerHTML = editorRef.current?.getPreviewHtml() ?? ''
    const nextMax = pane.scrollHeight - pane.clientHeight
    if (nextMax > 0) {
      const target = ratio * nextMax
      if (Math.abs(target - pane.scrollTop) > 1) {
        previewProgScrollRef.current = true
        pane.scrollTop = target
      }
    }
  }, [editorRef, isExportActive])

  // 打开预览时立即渲染一次
  useEffect(() => {
    if (!previewMode) return
    renderPreview()
  }, [previewMode, renderPreview])

  // 内容变化防抖刷新（350ms）：大文档连续输入不再逐键触发全量快照与 DOM 重建。
  // 真正的快照/innerHTML 工作放到 idle 回调执行，避免与输入在主线程争用造成可感知卡顿
  // （Electron 运行时支持 requestIdleCallback，旧环境回退到 setTimeout）。
  useEffect(() => {
    if (!previewMode) return
    let idleId: number | undefined
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === 'function') {
        idleId = requestIdleCallback(() => renderPreview(), { timeout: 500 })
      } else {
        renderPreview()
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      if (idleId !== undefined && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleId)
      }
    }
  }, [previewMode, activeContent, renderPreview])

  /** B1/B2：懒加载插件（KaTeX/Mermaid）渲染完成后立即刷新预览 */
  const handleRichRender = useCallback(() => {
    renderPreview()
  }, [renderPreview])

  // 编辑区 ↔ 预览区按比例同步滚动
  // 性能优化：rAF 节流（每帧最多同步一次）+ 一次性回显抑制（防程序化滚动乒乓回环）
  useEffect(() => {
    if (!previewMode) return
    const editorScroll = editorAreaRef.current?.querySelector(
      '.editor-scroll',
    ) as HTMLElement | null
    const previewEl = previewPaneRef.current
    if (!editorScroll || !previewEl) return

    let pendingFrom: 'editor' | 'preview' | null = null
    let suppressPane: 'editor' | 'preview' | null = null
    let suppressTimer = 0
    let raf = 0

    const applySync = () => {
      raf = 0
      const from = pendingFrom
      pendingFrom = null
      if (!from) return
      const src = from === 'editor' ? editorScroll : previewEl
      const dst = from === 'editor' ? previewEl : editorScroll
      const maxSrc = src.scrollHeight - src.clientHeight
      const maxDst = dst.scrollHeight - dst.clientHeight
      if (maxSrc <= 0 || maxDst <= 0) return
      // 标记对侧下一次滚动事件为回显，直接吞掉
      suppressPane = from === 'editor' ? 'preview' : 'editor'
      window.clearTimeout(suppressTimer)
      suppressTimer = window.setTimeout(() => {
        suppressPane = null
      }, 150)
      dst.scrollTop = (src.scrollTop / maxSrc) * maxDst
    }

    const requestSync = (from: 'editor' | 'preview') => {
      if (suppressPane === from) {
        suppressPane = null
        window.clearTimeout(suppressTimer)
        return
      }
      pendingFrom = from
      if (!raf) raf = requestAnimationFrame(applySync)
    }

    const onEditorScroll = () => requestSync('editor')
    const onPreviewScroll = () => {
      // renderPreview 刷新内容后的比例恢复滚动是程序化的，不属于用户操作
      if (previewProgScrollRef.current) {
        previewProgScrollRef.current = false
        return
      }
      requestSync('preview')
    }
    editorScroll.addEventListener('scroll', onEditorScroll, { passive: true })
    previewEl.addEventListener('scroll', onPreviewScroll, { passive: true })
    return () => {
      editorScroll.removeEventListener('scroll', onEditorScroll)
      previewEl.removeEventListener('scroll', onPreviewScroll)
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(suppressTimer)
    }
  }, [previewMode, editorAreaRef])

  return { previewContentRef, previewPaneRef, handleRichRender }
}
