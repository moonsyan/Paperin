import { forwardRef, useEffect, useRef, useState } from 'react'
import { Editor as MilkdownCore, EditorStatus, editorViewCtx } from '@milkdown/kit/core'
import { insert } from '@milkdown/kit/utils'
import { Milkdown, MilkdownProvider } from '@milkdown/react'
import { createEditorSubscription } from './adapter/editor-adapter'
import { EditorOverlays } from './overlays/EditorOverlays'
import { lineNumKey, setLineNumbersEnabled } from './plugins/codeLineNumbers'
import { subscribeMermaidRender } from './plugins/mermaidCodeBlock'
import { setWikiLinkClickHandler, setWikiTargetResolver, refreshWikiLinkStatus } from './plugins/wikiLink'
import { useEditorContentReplacement } from './content/useEditorContentReplacement'
import { useImageInsertion } from './useImageInsertion'
import { useMilkdownInstance } from './instance/useMilkdownInstance'
import { useEditorNavigation } from './navigation/useEditorNavigation'
import { useEditorOverlays } from './overlays/useEditorOverlays'
import type { EditorHandle, EditorProps } from './editor-types'

export type { EditorHandle } from './editor-types'

/* ==================== 组件 ==================== */

/**
 * Milkdown 编辑器主体
 * useEditor 只在挂载时执行一次，initialContent/onChange 通过 ref 透传，
 * 避免重渲染时重建编辑器导致光标丢失。
 */
const MilkdownInner = forwardRef<EditorHandle, EditorProps>(
  function MilkdownInner(
    {
      initialContent,
      onChange,
      imageHints,
      onCursorChange,
      onRichRender,
      blankClickToEnd = true,
      codeLineNumbers = false,
      spellcheck = false,
      onNotify,
      wikiLinkFiles,
      onWikiLinkClick,
      wikiResolveTest,
      frontmatterPanel,
      onFullscreenChange,
    },
    ref,
  ) {
    const editorRef = useRef<MilkdownCore | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const initialRef = useRef(initialContent)
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const subscriptionRef = useRef<ReturnType<typeof createEditorSubscription> | null>(null)
    if (!subscriptionRef.current) subscriptionRef.current = createEditorSubscription()
    const changeRef = useRef<(markdown: string) => void>(() => undefined)
    changeRef.current = (markdown) => {
      onChangeRef.current(markdown)
      subscriptionRef.current?.notify(markdown)
    }
    useEffect(() => () => subscriptionRef.current?.clear(), [])
    // 3.4：文档自上次落账以来是否发生过变更（由 docChanged 同步置位）。
    // 供 App 在切文件时判断是否需要全量序列化，避免对大文档无条件 getMarkdown()。
    const dirtyRef = useRef(false)
    const imageHintsRef = useRef(imageHints)
    imageHintsRef.current = imageHints
    const cursorRef = useRef(onCursorChange)
    cursorRef.current = onCursorChange
    const richRenderRef = useRef(onRichRender)
    richRenderRef.current = onRichRender
    const notifyRef = useRef(onNotify)
    notifyRef.current = onNotify
    // 3.1 Tier 2：大文档分块流式插入的协同状态（组件级，供 streamGuard 插件与分块循环读取）
    const streamingRef = useRef(false)
    const abortStreamRef = useRef(false)
    const streamGenerationRef = useRef(0)
    const [, bumpRender] = useState(0)

    useEffect(
      () =>
        subscribeMermaidRender(() => {
          richRenderRef.current?.()
        }),
      [],
    )

    // 拼写检查排除（代码块/行内代码 spellcheck=false）与图片 draggable：
    // 改用 nodeAttrsPlugin（ProseMirror 装饰）实现，不再外部修改 DOM

    const { overlayProps, handleMouseOver, handleMouseLeave, resetOverlays } = useEditorOverlays({
      editorRef,
      scrollRef,
      wikiLinkFiles,
      onFullscreenChange,
    })

    // 行号开关同步：更新模块级标志并触发装饰重建（编辑器未创建时由 init 读标志）
    useEffect(() => {
      setLineNumbersEnabled(codeLineNumbers)
      const ed = editorRef.current
      if (ed?.status === EditorStatus.Created) {
        const view = ed.ctx.get(editorViewCtx)
        view.dispatch(view.state.tr.setMeta(lineNumKey, true))
      }
    }, [codeLineNumbers])

    // 拼写检查：仅同步正文编辑根；默认关闭，设置开启后生效（代码块插件仍强制排除）
    useEffect(() => {
      const ed = editorRef.current
      if (ed?.status !== EditorStatus.Created) return
      const view = ed.ctx.get(editorViewCtx)
      view.dom.setAttribute('spellcheck', spellcheck ? 'true' : 'false')
    }, [spellcheck])

    // Wiki 链接点击：传递 onWikiLinkClick 到插件
    const wikiClickRef = useRef(onWikiLinkClick)
    wikiClickRef.current = onWikiLinkClick
    useEffect(() => {
      setWikiLinkClickHandler((target) => {
        wikiClickRef.current?.(target)
      })
      return () => setWikiLinkClickHandler(null)
    }, [])

    // 未解析链接标记：resolver 身份变化（工作区树/当前文件变化）时
    // 重设判定并触发一次装饰重算；无 resolver（演示模式/关闭工作区）时
    // 也要刷新一次，清掉旧工作区留下的未解析装饰
    const wikiResolveRef = useRef(wikiResolveTest)
    wikiResolveRef.current = wikiResolveTest
    useEffect(() => {
      const ed = editorRef.current
      if (!wikiResolveTest) {
        setWikiTargetResolver(null)
        if (ed?.status === EditorStatus.Created) {
          refreshWikiLinkStatus(ed.ctx.get(editorViewCtx))
        }
        return
      }
      setWikiTargetResolver((target) => wikiResolveRef.current?.(target) === true)
      if (ed?.status === EditorStatus.Created) {
        refreshWikiLinkStatus(ed.ctx.get(editorViewCtx))
      }
      return () => setWikiTargetResolver(null)
    }, [wikiResolveTest])

    const spellcheckRef = useRef(spellcheck)
    spellcheckRef.current = spellcheck

    useMilkdownInstance({
      editorRef,
      initialRef,
      changeRef,
      cursorRef,
      dirtyRef,
      streamingRef,
      abortStreamRef,
      spellcheckRef,
    })

    const { handleKeyDown, handleBlankClick } = useEditorNavigation({
      editorRef,
      blankClickToEnd,
    })

    /* ==================== 图片粘贴 / 拖入 ==================== */

    const { handlePaste, handleDrop, handleDragOver } = useImageInsertion({
      editorRef,
      imageHintsRef,
      insertMarkdown: (markdown) => {
        editorRef.current?.action(insert(markdown))
        bumpRender((count) => count + 1)
      },
      notify: (message) => notifyRef.current?.(message),
    })

    useEditorContentReplacement({
      ref,
      editorRef,
      containerRef,
      dirtyRef,
      streamingRef,
      abortStreamRef,
      streamGenerationRef,
      notifyRef,
      resetOverlays,
      subscription: subscriptionRef.current,
    })

    return (
      <div className="editor-area" ref={containerRef}>
        <div
          className="editor-scroll"
          ref={scrollRef}
          onMouseOver={handleMouseOver}
          onMouseLeave={handleMouseLeave}
        >
          {/* 文档属性面板：随内容滚动，宽度与正文对齐 */}
          {frontmatterPanel && <div className="fm-panel-wrap">{frontmatterPanel}</div>}
          <div
            className="editor-inner"
            ref={contentRef}
            onKeyDown={handleKeyDown}
            onClick={handleBlankClick}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <Milkdown />
          </div>
          <EditorOverlays {...overlayProps} />
        </div>

      </div>
    )
  },
)

/**
 * 所见即所得 Markdown 编辑器（Milkdown 内核）
 * 外层提供 MilkdownProvider 上下文，内层为真正的编辑器实例。
 */
export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  props,
  ref,
) {
  return (
    <MilkdownProvider>
      <MilkdownInner {...props} ref={ref} />
    </MilkdownProvider>
  )
})
