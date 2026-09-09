import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { EditorHandle } from '../../components/Editor'
import { toEditorImages, toStoredImages } from '../../lib/image-path'
import { initializeDocumentBaseline, isDocumentDirty } from '../../lib/document-tabs'
import { isLargeDocument } from '../constants'
import type { SetSearchMode } from '../useEditorSearch'
import type { DocumentState } from './useDocumentState'

type ReplaceMode = 'ignore' | 'initialize' | 'update'

interface EditorDocumentSyncOptions {
  state: DocumentState
  editorRef: RefObject<EditorHandle>
  dirOfFile: (fileId: string) => string | undefined
  cancelAutoSave: (fileId: string, content: string) => void
  scheduleAutoSave: (fileId: string, content: string) => void
  pinPreviewTab: (fileId: string) => void
  setToast: Dispatch<SetStateAction<string>>
  setSearchCount: Dispatch<SetStateAction<number>>
  setSearchCurrent: Dispatch<SetStateAction<number>>
  setSearchMode: SetSearchMode
}

export interface EditorDocumentSyncActions {
  handleEditorChange(markdown: string): void
  replaceEditorContent(fileId: string, content: string, mode?: ReplaceMode): void
  flushEditorContent(): void
}

export const shouldDeferLargeDocumentReplace = (
  content: string,
  isDeferring: boolean,
): boolean => isLargeDocument(content) && !isDeferring

export const useEditorDocumentSync = ({
  state,
  editorRef,
  dirOfFile,
  cancelAutoSave,
  scheduleAutoSave,
  pinPreviewTab,
  setToast,
  setSearchCount,
  setSearchCurrent,
  setSearchMode,
}: EditorDocumentSyncOptions): EditorDocumentSyncActions => {
  // 只解构稳定成员（ref 镜像与 setState）：state 对象本身每次渲染重建，
  // 若直接依赖 state 会让本模块全部回调失去稳定引用，拖垮下游记忆化
  const {
    activeFileIdRef,
    contentsRef,
    initialOrSavedRef,
    openFilesRef,
    setContents,
    setSavedMap,
  } = state
  const pendingReplaceRef = useRef<{
    fileId: string
    content: string
    mode: Exclude<ReplaceMode, 'update'>
    tries: number
  } | null>(null)
  const pendingReplaceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deferringLargeRef = useRef(false)
  const tickPendingReplaceRef = useRef<() => void>(() => {})

  const applyEditorContent = useCallback(
    (fileId: string, content: string, mode: Exclude<ReplaceMode, 'update'>) => {
      editorRef.current?.replaceContent(
        toEditorImages(content, dirOfFile(fileId)),
        () => {
          if (mode !== 'initialize') return
          const editorMarkdown = editorRef.current?.getMarkdown() ?? null
          const normalizedMarkdown = editorMarkdown === null
            ? null
            : toStoredImages(editorMarkdown, dirOfFile(fileId))
          const initialized = initializeDocumentBaseline(content, normalizedMarkdown)
          contentsRef.current = {
            ...contentsRef.current,
            [fileId]: initialized.content,
          }
          initialOrSavedRef.current[fileId] = initialized.baseline
          setContents((previous) => ({ ...previous, [fileId]: initialized.content }))
          setSavedMap((previous) => ({ ...previous, [fileId]: true }))
          cancelAutoSave(fileId, initialized.content)
        },
      )
    },
    [cancelAutoSave, contentsRef, dirOfFile, editorRef, initialOrSavedRef, setContents, setSavedMap],
  )

  const tickPendingReplace = useCallback(() => {
    pendingReplaceTimerRef.current = null
    const pending = pendingReplaceRef.current
    if (!pending) return
    if (editorRef.current?.isReady()) {
      pendingReplaceRef.current = null
      deferringLargeRef.current = false
      applyEditorContent(pending.fileId, pending.content, pending.mode)
      return
    }
    if (pending.tries < 50) {
      pending.tries++
      pendingReplaceTimerRef.current = setTimeout(tickPendingReplaceRef.current, 100)
      return
    }
    pendingReplaceRef.current = null
    deferringLargeRef.current = false
    setToast('编辑器未就绪，最近打开的文件内容可能未加载，请刷新窗口')
  }, [applyEditorContent, editorRef, setToast])
  tickPendingReplaceRef.current = tickPendingReplace

  // 卸载时清理待替换计时器：大文档或编辑器未就绪期间若组件卸载，
  // 残留的 setTimeout 重试会在卸载后继续触发 applyEditorContent（含 setState），
  // 造成悬空计时器与潜在的卸载后状态更新。
  useEffect(() => {
    return () => {
      if (pendingReplaceTimerRef.current) clearTimeout(pendingReplaceTimerRef.current)
    }
  }, [])

  const handleEditorChange = useCallback((markdown: string) => {
    const fileId = activeFileIdRef.current
    if (!openFilesRef.current.some((file) => file.id === fileId)) return
    // markdownUpdated 的防抖在 flush 时取 latestTr.doc 序列化，回调链同步执行，
    // 回调携带的必然是当前文档内容；不再与 getMarkdown() 二次全量序列化比对
    // （大文档下该比对是每个防抖窗口一次的纯冗余开销）
    const stored = toStoredImages(markdown, dirOfFile(fileId))
    if (contentsRef.current[fileId] !== stored) {
      contentsRef.current = { ...contentsRef.current, [fileId]: stored }
    }
    setContents((previous) =>
      previous[fileId] === stored ? previous : { ...previous, [fileId]: stored },
    )
    const isSaved = !isDocumentDirty(stored, initialOrSavedRef.current[fileId] ?? '')
    setSavedMap((previous) =>
      previous[fileId] === isSaved ? previous : { ...previous, [fileId]: isSaved },
    )
    if (isSaved) {
      cancelAutoSave(fileId, stored)
      return
    }
    pinPreviewTab(fileId)
    scheduleAutoSave(fileId, stored)
    editorRef.current?.consumeDirtyChange()
  }, [activeFileIdRef, cancelAutoSave, contentsRef, dirOfFile, editorRef, initialOrSavedRef, openFilesRef, pinPreviewTab, scheduleAutoSave, setContents, setSavedMap])

  const replaceEditorContent = useCallback(
    (fileId: string, content: string, mode: ReplaceMode = 'ignore') => {
      if (mode === 'update') {
        // update 直接写入编辑器，必须作废排队中的延迟替换：
        // 否则随后 tick 触发的旧内容整篇替换会覆盖掉这次 update 的修改
        if (pendingReplaceTimerRef.current) {
          clearTimeout(pendingReplaceTimerRef.current)
          pendingReplaceTimerRef.current = null
        }
        pendingReplaceRef.current = null
        deferringLargeRef.current = false
        const stored = toStoredImages(content, dirOfFile(fileId))
        contentsRef.current = { ...contentsRef.current, [fileId]: stored }
        setContents((previous) => ({ ...previous, [fileId]: stored }))
        const isSaved = !isDocumentDirty(stored, initialOrSavedRef.current[fileId] ?? '')
        setSavedMap((previous) => ({ ...previous, [fileId]: isSaved }))
        if (!isSaved) pinPreviewTab(fileId)
        editorRef.current?.updateContentPreservingHistory(toEditorImages(content, dirOfFile(fileId)))
        return
      }
      if (!editorRef.current?.isReady()) {
        pendingReplaceRef.current = { fileId, content, mode, tries: 0 }
        if (!pendingReplaceTimerRef.current) {
          pendingReplaceTimerRef.current = setTimeout(tickPendingReplaceRef.current, 100)
        }
        return
      }
      if (shouldDeferLargeDocumentReplace(content, deferringLargeRef.current)) {
        deferringLargeRef.current = true
        pendingReplaceRef.current = { fileId, content, mode, tries: 0 }
        if (!pendingReplaceTimerRef.current) {
          pendingReplaceTimerRef.current = setTimeout(tickPendingReplaceRef.current, 0)
        }
        return
      }
      if (pendingReplaceRef.current) {
        pendingReplaceRef.current = null
        deferringLargeRef.current = false
      }
      applyEditorContent(fileId, content, mode)
    },
    [applyEditorContent, contentsRef, dirOfFile, editorRef, initialOrSavedRef, pinPreviewTab, setContents, setSavedMap],
  )

  const flushEditorContent = useCallback(() => {
    if (!editorRef.current?.isReady()) return
    const fileId = activeFileIdRef.current
    if (!fileId || !openFilesRef.current.some((file) => file.id === fileId)) return
    // 搜索命中随文件切换整体作废，查找/替换栏同步关闭——
    // 只清命中不清栏会留下一栏 Enter/按钮全部无效的死栏
    const closeSearchBar = () => {
      editorRef.current?.endSearch()
      setSearchMode('none')
      setSearchCount(0)
      setSearchCurrent(-1)
    }
    if (!editorRef.current.consumeDirtyChange()) {
      closeSearchBar()
      return
    }
    const markdown = editorRef.current.getMarkdown()
    if (markdown === null) {
      closeSearchBar()
      return
    }
    const stored = toStoredImages(markdown, dirOfFile(fileId))
    if (contentsRef.current[fileId] !== stored) {
      contentsRef.current = { ...contentsRef.current, [fileId]: stored }
    }
    setContents((previous) =>
      previous[fileId] === stored ? previous : { ...previous, [fileId]: stored },
    )
    const isSaved = !isDocumentDirty(stored, initialOrSavedRef.current[fileId] ?? '')
    setSavedMap((previous) =>
      previous[fileId] === isSaved ? previous : { ...previous, [fileId]: isSaved },
    )
    if (isSaved) cancelAutoSave(fileId, stored)
    else {
      pinPreviewTab(fileId)
      scheduleAutoSave(fileId, stored)
    }
    closeSearchBar()
  }, [activeFileIdRef, cancelAutoSave, contentsRef, dirOfFile, editorRef, initialOrSavedRef, openFilesRef, pinPreviewTab, scheduleAutoSave, setSearchCount, setSearchCurrent, setSearchMode, setContents, setSavedMap])

  return { handleEditorChange, replaceEditorContent, flushEditorContent }
}
