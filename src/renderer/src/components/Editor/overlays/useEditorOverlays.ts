import { useCallback, useEffect, useRef, useState, type ComponentProps, type MutableRefObject, type RefObject } from 'react'
import { Editor as MilkdownCore, EditorStatus, editorViewCtx } from '@milkdown/kit/core'
import type { Node as ProseNode } from '@milkdown/kit/prose/model'
import { Selection } from '@milkdown/kit/prose/state'
import { deleteColumn, deleteRow, deleteTable } from '@milkdown/kit/prose/tables'
import {
  addColAfterCommand,
  addRowAfterCommand,
  setAlignCommand,
  toggleStrikethroughCommand,
} from '@milkdown/kit/preset/gfm'
import {
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleStrongCommand,
} from '@milkdown/kit/preset/commonmark'
import { callCommand } from '@milkdown/kit/utils'
import { isImeComposing } from '../../../lib/keyboard'
import { normalizeCodeLanguage } from '../../../lib/code-language'
import { EditorOverlays, type CodePanelState, type FullscreenCodeState, type SelectionToolbarState, type TablePanelState } from './EditorOverlays'
import { filterWikiSuggestions, type WikiSuggestion } from './WikiAutocomplete'
import {
  setWikiAutocompleteHandler,
  type WikiAutocompleteState,
} from '../plugins/wikiLink'

type EditorOverlaysProps = ComponentProps<typeof EditorOverlays>

interface WikiAutocompletePositionInput {
  from: number
  to: number
  coords: { top: number; left: number }
  anchor: {
    scrollTop: number
    scrollLeft: number
    getBoundingClientRect: () => { top: number; left: number }
  } | null
  cached: WikiAutocompletePosition | null
}

export interface WikiAutocompletePosition {
  key: string
  x: number
  y: number
}

interface UseEditorOverlaysOptions {
  editorRef: MutableRefObject<MilkdownCore | null>
  scrollRef: RefObject<HTMLDivElement>
  wikiLinkFiles?: WikiSuggestion[]
  onFullscreenChange?: (open: boolean) => void
}

/** 把浮层视口坐标换算为滚动容器内容坐标，并按选区复用已有坐标。 */
export const getWikiAutocompletePosition = ({
  from,
  to,
  coords,
  anchor,
  cached,
}: WikiAutocompletePositionInput): WikiAutocompletePosition => {
  const key = `${from}:${to}`
  if (cached?.key === key) return cached
  if (!anchor) {
    return {
      key,
      x: coords.left,
      y: coords.top,
    }
  }
  const anchorRect = anchor.getBoundingClientRect()
  return {
    key,
    x: coords.left - anchorRect.left + anchor.scrollLeft,
    y: coords.top - anchorRect.top + anchor.scrollTop,
  }
}

export const useEditorOverlays = ({
  editorRef,
  scrollRef,
  wikiLinkFiles,
  onFullscreenChange,
}: UseEditorOverlaysOptions): {
  overlayProps: EditorOverlaysProps
  handleMouseOver: (event: React.MouseEvent) => void
  handleMouseLeave: () => void
  resetOverlays: () => void
} => {
  const [codePanel, setCodePanel] = useState<CodePanelState | null>(null)
  const [langInput, setLangInput] = useState('')
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>()
  const lastPreRef = useRef<HTMLElement | null>(null)
  const [tablePanel, setTablePanel] = useState<TablePanelState | null>(null)
  const [fullscreenCode, setFullscreenCode] = useState<FullscreenCodeState | null>(null)
  const [wikiAcState, setWikiAcState] = useState<WikiAutocompleteState | null>(null)
  const wikiAcPosRef = useRef<WikiAutocompletePosition | null>(null)
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null)
  // 最近一次真实用户交互（指针/按键）时间：仅在其后短暂窗口内显示选区工具条，
  // 避免切换标签恢复历史选区、程序性 setSelection 时工具条凭空弹出
  const lastGestureRef = useRef(0)

  const resetOverlays = useCallback(() => {
    setCodePanel(null)
    setTablePanel(null)
    setFullscreenCode(null)
    setWikiAcState(null)
    setSelectionToolbar(null)
    lastPreRef.current = null
    setLangInput('')
    setCopied(false)
  }, [])

  useEffect(() => {
    setWikiAutocompleteHandler((state) => {
      setWikiAcState(state)
    })
    return () => setWikiAutocompleteHandler(null)
  }, [])

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!fullscreenCode) return
    onFullscreenChange?.(true)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isImeComposing(event)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setFullscreenCode(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      onFullscreenChange?.(false)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [fullscreenCode, onFullscreenChange])

  const offsetInScroll = (element: HTMLElement): { top: number; left: number } => {
    const scrollElement = scrollRef.current
    let top = 0
    let left = 0
    let current: HTMLElement | null = element
    while (current && current !== scrollElement) {
      top += current.offsetTop
      left += current.offsetLeft
      current = current.offsetParent as HTMLElement | null
    }
    return { top, left }
  }

  const handleMouseOver = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest('.code-panel') || target.closest('.table-panel')) return
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    const table = target.closest('table')
    if (table && scrollElement.contains(table)) {
      setCodePanel(null)
      lastPreRef.current = null
      const { top, left } = offsetInScroll(table)
      setTablePanel({
        table,
        top: top + 4,
        left: Math.max(8, left + table.offsetWidth - 340),
      })
      return
    }

    const pre = target.closest('pre')
    if (!pre || !scrollElement.contains(pre)) {
      setCodePanel(null)
      setTablePanel(null)
      lastPreRef.current = null
      return
    }
    if (pre.classList.contains('mermaid-source-block')) {
      setCodePanel(null)
      setTablePanel(null)
      return
    }
    setTablePanel(null)
    if (lastPreRef.current !== pre) {
      lastPreRef.current = pre
      setLangInput(pre.getAttribute('data-language') || '')
    }
    const { top, left } = offsetInScroll(pre)
    setCodePanel({
      pre,
      top: top + 8,
      left: left + pre.offsetWidth - 216,
      language: pre.getAttribute('data-language') || '',
    })
  }

  const handleMouseLeave = () => {
    setCodePanel(null)
    setTablePanel(null)
  }

  /* ==================== 选区浮动格式工具条 ==================== */

  /** 按当前编辑器选区计算工具条位置（无选区/组合输入中则隐藏） */
  const evaluateSelectionToolbar = useCallback(() => {
    const editor = editorRef.current?.status === EditorStatus.Created ? editorRef.current : null
    const scrollElement = scrollRef.current
    if (!editor || !scrollElement) {
      setSelectionToolbar(null)
      return
    }
    const view = editor.ctx.get(editorViewCtx)
    const sel = view.state.selection
    if (view.composing || sel.empty) {
      setSelectionToolbar(null)
      return
    }
    // 仅在用户刚刚操作过（选区由用户手势产生）时显示
    if (Date.now() - lastGestureRef.current > 2_500) {
      setSelectionToolbar(null)
      return
    }
    try {
      const coords = view.coordsAtPos(sel.from)
      const rect = scrollElement.getBoundingClientRect()
      const top = coords.top - rect.top + scrollElement.scrollTop - 42
      const left = Math.max(8, coords.left - rect.left + scrollElement.scrollLeft)
      setSelectionToolbar((prev) =>
        prev && Math.abs(prev.top - Math.max(4, top)) < 1 && Math.abs(prev.left - left) < 1
          ? prev
          : { top: Math.max(4, top), left },
      )
    } catch {
      setSelectionToolbar(null)
    }
  }, [editorRef, scrollRef])

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return
    const markGesture = () => {
      lastGestureRef.current = Date.now()
    }
    // 选区变化统一入口：鼠标选择、双击选词、Shift+方向键、Ctrl+A、输入折叠选区
    let raf = 0
    const onSelectionChange = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(evaluateSelectionToolbar)
    }
    // document 级监听：点击侧栏/搜索框等编辑器外部区域也要收起工具条
    //（编辑器内的 PM 选区不会因外部点击而折叠，selectionchange 不会再来）
    const onPointerDown = (e: PointerEvent) => {
      markGesture()
      if ((e.target as HTMLElement).closest('.selection-toolbar')) return
      setSelectionToolbar(null)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isImeComposing(e)) return
      markGesture()
      if (e.key === 'Escape') setSelectionToolbar(null)
    }
    const onScroll = () => setSelectionToolbar(null)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('pointerdown', onPointerDown)
    scrollElement.addEventListener('keydown', onKeyDown)
    scrollElement.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('pointerdown', onPointerDown)
      scrollElement.removeEventListener('keydown', onKeyDown)
      scrollElement.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions)
    }
  }, [evaluateSelectionToolbar, scrollRef])

  const runSelectionFormat: EditorOverlaysProps['onSelectionFormat'] = (kind) => {
    const editor = editorRef.current?.status === EditorStatus.Created ? editorRef.current : null
    if (!editor) return
    switch (kind) {
      case 'bold':
        editor.action(callCommand(toggleStrongCommand.key))
        break
      case 'italic':
        editor.action(callCommand(toggleEmphasisCommand.key))
        break
      case 'strike':
        editor.action(callCommand(toggleStrikethroughCommand.key))
        break
      case 'code':
        editor.action(callCommand(toggleInlineCodeCommand.key))
        break
    }
    // 命令作用于原选区，保持选区让用户可连续应用多种格式
    editor.ctx.get(editorViewCtx).focus()
  }

  const ensureSelectionInTable = (table: HTMLElement): boolean => {
    const editor = editorRef.current?.status === EditorStatus.Created ? editorRef.current : null
    if (!editor) return false
    const view = editor.ctx.get(editorViewCtx)
    try {
      const position = view.posAtDOM(table, 0)
      const $position = view.state.doc.resolve(position)
      let tablePosition = -1
      let tableNode: ProseNode | null = null
      for (let depth = $position.depth; depth >= 0; depth--) {
        if ($position.node(depth).type.name !== 'table') continue
        tablePosition = $position.before(depth)
        tableNode = $position.node(depth)
        break
      }
      if (!tableNode) return false
      const selection = view.state.selection
      const isInside = selection.from > tablePosition && selection.from < tablePosition + tableNode.nodeSize
      if (!isInside) {
        const target = Selection.findFrom(view.state.doc.resolve(tablePosition + 1), 1)
        if (!target) return false
        view.dispatch(view.state.tr.setSelection(target))
      }
      return true
    } catch {
      return false
    }
  }

  const runTableAction: EditorOverlaysProps['onTableAction'] = (action) => {
    if (!tablePanel) return
    if (!ensureSelectionInTable(tablePanel.table)) return
    const editor = editorRef.current?.status === EditorStatus.Created ? editorRef.current : null
    if (!editor) return
    const view = editor.ctx.get(editorViewCtx)
    switch (action) {
      case 'addRow':
        editor.action(callCommand(addRowAfterCommand.key))
        return
      case 'addCol':
        editor.action(callCommand(addColAfterCommand.key))
        return
      case 'delRow':
        deleteRow(view.state, view.dispatch)
        return
      case 'delCol':
        deleteColumn(view.state, view.dispatch)
        return
      case 'delTable':
        deleteTable(view.state, view.dispatch)
        setTablePanel(null)
        return
      case 'alignLeft':
        editor.action(callCommand(setAlignCommand.key, 'left'))
        return
      case 'alignCenter':
        editor.action(callCommand(setAlignCommand.key, 'center'))
        return
      case 'alignRight':
        editor.action(callCommand(setAlignCommand.key, 'right'))
    }
  }

  const applyLanguage = (language: string) => {
    if (!codePanel) return
    const editor = editorRef.current?.status === EditorStatus.Created ? editorRef.current : null
    if (!editor) return
    const normalized = normalizeCodeLanguage(language)
    const view = editor.ctx.get(editorViewCtx)
    try {
      const position = view.posAtDOM(codePanel.pre, 0)
      const $position = view.state.doc.resolve(position)
      for (let depth = $position.depth; depth >= 0; depth--) {
        const node = $position.node(depth)
        if (node.type.name !== 'code_block') continue
        view.dispatch(
          view.state.tr.setNodeMarkup($position.before(depth), undefined, {
            ...node.attrs,
            language: normalized,
          }),
        )
        break
      }
    } catch {
      // DOM 位置解析失败时保持当前浮层状态。
    }
    setCodePanel((current) => (current ? { ...current, language: normalized } : current))
    setLangInput(normalized)
  }

  const getCodeText = (pre: HTMLElement): string => {
    const clone = pre.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.code-line-numbers, .structured-code-tools, .code-fold-toggle').forEach((element) => element.remove())
    return clone.textContent ?? ''
  }

  const handleCopy = () => {
    if (!codePanel) return
    navigator.clipboard
      .writeText(getCodeText(codePanel.pre))
      .then(() => {
        setCopied(true)
        clearTimeout(copiedTimer.current)
        copiedTimer.current = setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {})
  }

  const wikiAutocomplete = wikiAcState && wikiLinkFiles && wikiLinkFiles.length > 0
    ? (() => {
        const position = getWikiAutocompletePosition({
          ...wikiAcState,
          anchor: scrollRef.current,
          cached: wikiAcPosRef.current,
        })
        wikiAcPosRef.current = position
        return {
          query: wikiAcState.query,
          suggestions: filterWikiSuggestions(
            wikiLinkFiles as unknown as {
              name: string
              path: string
              children?: Array<{ name: string; path: string; children?: unknown[] }>
            }[],
            wikiAcState.query,
          ),
          x: position.x,
          y: position.y,
          onSelect: (path: string) => {
            setWikiAcState(null)
            const editor = editorRef.current
            if (editor?.status !== EditorStatus.Created) return
            const view = editor.ctx.get(editorViewCtx)
            const { from, to } = wikiAcState
            const documentSize = view.state.doc.content.size
            if (from > documentSize || to > documentSize) return
            const nodeType = view.state.schema.nodes.wiki_link
            if (!nodeType) return
            const transaction = view.state.tr.replaceRangeWith(
              from,
              to,
              nodeType.create({
                target: path.replace(/\\/g, '/'),
                alias: '',
              }),
            )
            view.dispatch(transaction)
          },
          onClose: () => setWikiAcState(null),
        }
      })()
    : null

  return {
    overlayProps: {
      codePanel,
      tablePanel,
      fullscreenCode,
      wikiAutocomplete,
      selectionToolbar,
      language: langInput,
      copied,
      onLanguageChange: setLangInput,
      onApplyLanguage: applyLanguage,
      onCloseCodePanel: () => setCodePanel(null),
      onSelectionFormat: runSelectionFormat,
      onOpenFullscreen: () => {
        if (!codePanel) return
        setFullscreenCode({
          language: codePanel.language,
          text: getCodeText(codePanel.pre),
        })
      },
      onCopyCode: handleCopy,
      onTableAction: runTableAction,
      onCloseFullscreen: () => setFullscreenCode(null),
      onCopyFullscreen: () => {
        if (!fullscreenCode) return
        navigator.clipboard.writeText(fullscreenCode.text).catch(() => {})
      },
    },
    handleMouseOver,
    handleMouseLeave,
    resetOverlays,
  }
}
