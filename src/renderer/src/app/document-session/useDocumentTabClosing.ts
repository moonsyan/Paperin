import { useCallback, useEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { toStoredImages } from '../../lib/image-path'
import {
  findDiscardablePreview,
  getClosableTabIds,
  reorderTabsWithinGroup,
  togglePinnedTab,
} from '../../lib/document-tabs'
import type { DocumentSaveQueue } from '../../lib/document-save-queue'
import { flushPersistedSettings } from '../../hooks/usePersistedSetting'
import type { PendingDraft } from '../../hooks/useDraftPersistence'
import type { WorkspaceDocumentsState } from '../../../../shared/workspace-state'
import { DEFAULT_FILE_ID } from '../../data/demo-files'
import type { EditorHandle } from '../../components/Editor'
import type { DocumentState } from './useDocumentState'
import type { AutoSaveSnapshot } from './types'
import { planTabRemoval } from './tab-close-plan'

interface DocumentTabClosingOptions {
  state: DocumentState
  editorRef: RefObject<EditorHandle>
  flushEditorContent: () => void
  replaceEditorContent: (fileId: string, content: string, mode?: 'initialize' | 'update' | 'ignore') => void
  pinPreviewTab: (fileId: string) => void
  dirOfFile: (fileId: string) => string | undefined
  saveBeforeClose: (id: string) => Promise<boolean>
  saveQueueRef: MutableRefObject<DocumentSaveQueue<AutoSaveSnapshot> | null>
  clearDraft: (fileId: string) => Promise<void>
  draftPendingRef: MutableRefObject<PendingDraft | null>
  captureWorkspaceDocumentView: (fileId: string) => void
  setToast: (message: string) => void
  workspacePathRef: MutableRefObject<string | undefined>
  workspaceDocumentsRef: MutableRefObject<WorkspaceDocumentsState>
}

export interface DocumentTabClosingApi {
  discardPreviewTab: (nextFileId: string) => void
  removeClosedTabs: (ids: string[]) => void
  saveAllBeforeWindowClose: () => Promise<boolean>
  handleCloseTab: (id: string) => Promise<void>
  handleCloseOtherTabs: (targetId: string) => void
  handleCloseAllTabs: () => void
  handleTogglePinnedTab: (id: string) => void
  handleReorderTabs: (from: number, to: number) => void
}

/** 标签关闭、预览回收、固定和排序；与文件读取/打开分离。 */
export function useDocumentTabClosing({
  state,
  editorRef,
  flushEditorContent,
  replaceEditorContent,
  pinPreviewTab,
  dirOfFile,
  saveBeforeClose,
  saveQueueRef,
  clearDraft,
  draftPendingRef,
  captureWorkspaceDocumentView,
  setToast,
  workspacePathRef,
  workspaceDocumentsRef,
}: DocumentTabClosingOptions): DocumentTabClosingApi {
  const {
    activeFileIdRef,
    contentsRef,
    initialOrSavedRef: initialOrSaved,
    openFilesRef,
    setActiveFileId,
    setContents,
    setDocTitle,
    setEncodingMap,
    setFileMtime,
    setOpenFiles,
    setSavedMap,
  } = state

  const discardPreviewTab = useCallback((nextFileId: string) => {
    const previous = findDiscardablePreview(openFilesRef.current, nextFileId)
    if (!previous) return
    if (previous.id === activeFileIdRef.current && editorRef.current?.isReady()) {
      const markdown = editorRef.current.getMarkdown()
      if (markdown !== null) {
        const stored = toStoredImages(markdown, dirOfFile(previous.id))
        if (stored !== (contentsRef.current[previous.id] ?? '')) {
          flushEditorContent()
          pinPreviewTab(previous.id)
          return
        }
      }
    }
    openFilesRef.current = openFilesRef.current.filter((file) => file.id !== previous.id)
    setOpenFiles((previousFiles) => previousFiles.filter((file) => file.id !== previous.id))
    setContents((previousContents) => removeDocumentValue(previousContents, previous.id))
    setSavedMap((previousSaved) => removeDocumentValue(previousSaved, previous.id))
    setFileMtime((previousMtime) => removeDocumentValue(previousMtime, previous.id))
    setEncodingMap((previousEncoding) => removeDocumentValue(previousEncoding, previous.id))
    delete initialOrSaved.current[previous.id]
  }, [activeFileIdRef, contentsRef, dirOfFile, editorRef, flushEditorContent, initialOrSaved, openFilesRef, pinPreviewTab, setContents, setEncodingMap, setFileMtime, setOpenFiles, setSavedMap])

  const removeClosedTabs = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const plan = planTabRemoval(openFilesRef.current, activeFileIdRef.current, ids, DEFAULT_FILE_ID)
    openFilesRef.current = plan.nextOpenFiles
    setOpenFiles(plan.nextOpenFiles)
    setContents((previous) => {
      const next = removeDocumentValues(previous, ids)
      contentsRef.current = next
      return next
    })
    setSavedMap((previous) => removeDocumentValues(previous, ids))
    setFileMtime((previous) => removeDocumentValues(previous, ids))
    setEncodingMap((previous) => removeDocumentValues(previous, ids))
    for (const id of ids) {
      saveQueueRef.current?.cancel(id)
      delete initialOrSaved.current[id]
      if (draftPendingRef.current?.id === id) draftPendingRef.current = null
      void clearDraft(id)
    }
    if (!plan.activeTabWasClosed) return
    activeFileIdRef.current = plan.nextActiveFileId
    setActiveFileId(plan.nextActiveFileId)
    const nextActive = plan.nextOpenFiles[0]
    if (!nextActive) {
      setDocTitle('未命名文档')
      replaceEditorContent(DEFAULT_FILE_ID, '')
      return
    }
    setDocTitle(nextActive.name)
    replaceEditorContent(nextActive.id, contentsRef.current[nextActive.id] ?? '')
  }, [activeFileIdRef, clearDraft, contentsRef, draftPendingRef, initialOrSaved, openFilesRef, replaceEditorContent, saveQueueRef, setActiveFileId, setContents, setDocTitle, setEncodingMap, setFileMtime, setOpenFiles, setSavedMap])

  const saveAllBeforeWindowClose = useCallback(async (): Promise<boolean> => {
    captureWorkspaceDocumentView(activeFileIdRef.current)
    flushEditorContent()
    for (const file of openFilesRef.current) {
      if (!await saveBeforeClose(file.id)) return false
      if (!file.path) removeClosedTabs([file.id])
    }
    await saveQueueRef.current?.flushAll()
    flushPersistedSettings()
    if (workspacePathRef.current && window.desktopAPI) {
      const result = await window.desktopAPI.workspaceState.saveDocuments(workspaceDocumentsRef.current)
      if (!result.ok) setToast('文档视图状态保存失败')
    }
    return true
  }, [activeFileIdRef, captureWorkspaceDocumentView, flushEditorContent, openFilesRef, removeClosedTabs, saveBeforeClose, saveQueueRef, setToast, workspaceDocumentsRef, workspacePathRef])

  useEffect(() => {
    const currentWindow = window as unknown as { __paperin_saveAll?: () => Promise<boolean> }
    currentWindow.__paperin_saveAll = saveAllBeforeWindowClose
    return () => { delete currentWindow.__paperin_saveAll }
  }, [saveAllBeforeWindowClose])

  const handleCloseTab = useCallback(async (id: string): Promise<void> => {
    if (id === activeFileIdRef.current) flushEditorContent()
    if (!await saveBeforeClose(id)) return
    removeClosedTabs([id])
  }, [activeFileIdRef, flushEditorContent, removeClosedTabs, saveBeforeClose])

  const closeTabsBatch = useCallback(async (ids: string[]): Promise<void> => {
    if (ids.length === 0) return
    if (ids.includes(activeFileIdRef.current)) flushEditorContent()
    for (const id of ids) {
      if (!await saveBeforeClose(id)) return
      removeClosedTabs([id])
    }
  }, [activeFileIdRef, flushEditorContent, removeClosedTabs, saveBeforeClose])

  const handleCloseOtherTabs = useCallback((targetId: string) => {
    void closeTabsBatch(getClosableTabIds(openFilesRef.current, 'others', targetId))
  }, [closeTabsBatch, openFilesRef])
  const handleCloseAllTabs = useCallback(() => {
    void closeTabsBatch(getClosableTabIds(openFilesRef.current, 'all', null))
  }, [closeTabsBatch, openFilesRef])
  const handleTogglePinnedTab = useCallback((id: string) => {
    const nextOpenFiles = togglePinnedTab(openFilesRef.current, id)
    if (nextOpenFiles === openFilesRef.current) return
    openFilesRef.current = nextOpenFiles
    setOpenFiles(nextOpenFiles)
  }, [openFilesRef, setOpenFiles])
  const handleReorderTabs = useCallback((from: number, to: number) => {
    const nextOpenFiles = reorderTabsWithinGroup(openFilesRef.current, from, to)
    if (nextOpenFiles === openFilesRef.current) return
    openFilesRef.current = nextOpenFiles
    setOpenFiles(nextOpenFiles)
  }, [openFilesRef, setOpenFiles])

  return { discardPreviewTab, removeClosedTabs, saveAllBeforeWindowClose, handleCloseTab, handleCloseOtherTabs, handleCloseAllTabs, handleTogglePinnedTab, handleReorderTabs }
}

const removeDocumentValue = <T,>(values: Record<string, T>, id: string): Record<string, T> => {
  const next = { ...values }
  delete next[id]
  return next
}

const removeDocumentValues = <T,>(values: Record<string, T>, ids: string[]): Record<string, T> => {
  const next = { ...values }
  for (const id of ids) delete next[id]
  return next
}
