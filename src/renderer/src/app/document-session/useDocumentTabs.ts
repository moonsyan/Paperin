import { useCallback } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type { PendingDraft } from '../../hooks/useDraftPersistence'
import type { DocumentSaveQueue } from '../../lib/document-save-queue'
import type { WorkspaceDocumentsState } from '../../../../shared/workspace-state'
import type { EditorHandle } from '../../components/Editor'
import type { DocumentState } from './useDocumentState'
import type { AutoSaveSnapshot } from './types'
import { useDocumentTabClosing } from './useDocumentTabClosing'
import { useDocumentTabOpening } from './useDocumentTabOpening'
import { useWorkspaceDocumentView } from './useWorkspaceDocumentView'

export interface UseDocumentTabsOptions {
  state: DocumentState
  editorRef: RefObject<EditorHandle>
  titleRef: RefObject<HTMLDivElement>
  flushEditorContent: () => void
  replaceEditorContent: (fileId: string, content: string, mode?: 'initialize' | 'update' | 'ignore') => void
  pinPreviewTab: (fileId: string) => void
  dirOfFile: (fileId: string) => string | undefined
  saveBeforeClose: (id: string) => Promise<boolean>
  saveQueueRef: MutableRefObject<DocumentSaveQueue<AutoSaveSnapshot> | null>
  clearDraft: (fileId: string) => Promise<void>
  draftPendingRef: MutableRefObject<PendingDraft | null>
  focusEditorSoon: () => void
  recordRecent: (path: string, name: string) => void
  setToast: (message: string) => void
  workspacePathRef: MutableRefObject<string | undefined>
  workspaceDocumentsRef: MutableRefObject<WorkspaceDocumentsState>
  setWorkspaceDocuments: (next: WorkspaceDocumentsState) => void
  /** 最后一次文件选择意图；慢读取完成后不得反向抢占当前文件。 */
  latestWorkspaceSelectionRef: MutableRefObject<string>
  openingWorkspaceFilesRef: MutableRefObject<Map<string, Promise<boolean>>>
}

export interface DocumentTabsApi {
  discardPreviewTab: (fileId: string) => void
  switchFile: (id: string) => void
  handleNew: () => void
  handleSelectDemoFile: (id: string, pinned?: boolean) => void
  handleOpen: () => Promise<void>
  handleSelectWorkspaceFile: (path: string, pinned?: boolean) => Promise<boolean>
  captureWorkspaceDocumentView: (fileId: string) => void
  restoreWorkspaceDocumentView: (fileId: string, tries?: number) => void
  removeClosedTabs: (ids: string[]) => void
  saveAllBeforeWindowClose: () => Promise<boolean>
  handleCloseTab: (id: string) => Promise<void>
  handleCloseOtherTabs: (targetId: string) => void
  handleCloseAllTabs: () => void
  handleTogglePinnedTab: (id: string) => void
  handleReorderTabs: (from: number, to: number) => void
}

/**
 * 文档标签域门面。它只编排工作区视图、文件打开、关闭保存与标签切换，
 * 对 useDocumentSession 的公开接口和既有行为保持不变。
 */
export function useDocumentTabs(options: UseDocumentTabsOptions): DocumentTabsApi {
  const {
    state, editorRef, titleRef, flushEditorContent, replaceEditorContent, pinPreviewTab, dirOfFile,
    saveBeforeClose, saveQueueRef, clearDraft, draftPendingRef, focusEditorSoon, recordRecent,
    setToast, workspacePathRef, workspaceDocumentsRef, setWorkspaceDocuments,
    latestWorkspaceSelectionRef, openingWorkspaceFilesRef,
  } = options
  const { activeFileIdRef, contentsRef, openFilesRef, setActiveFileId, setDocTitle } = state
  const {
    captureWorkspaceDocumentView,
    restoreWorkspaceDocumentView,
  } = useWorkspaceDocumentView({
    activeFileIdRef, editorRef, openFilesRef, workspacePathRef, workspaceDocumentsRef,
    setWorkspaceDocuments,
  })
  const closing = useDocumentTabClosing({
    state, editorRef, flushEditorContent, replaceEditorContent, pinPreviewTab, dirOfFile,
    saveBeforeClose, saveQueueRef, clearDraft, draftPendingRef,
    captureWorkspaceDocumentView,
    setToast, workspacePathRef, workspaceDocumentsRef,
  })
  const switchFile = useCallback((id: string) => {
    if (id === activeFileIdRef.current) return
    latestWorkspaceSelectionRef.current = ''
    if (!openFilesRef.current.some((file) => file.id === id)) return
    captureWorkspaceDocumentView(activeFileIdRef.current)
    flushEditorContent()
    titleRef.current?.blur()
    activeFileIdRef.current = id
    setActiveFileId(id)
    const file = openFilesRef.current.find((candidate) => candidate.id === id)
    setDocTitle(file?.name ?? '未命名文档')
    replaceEditorContent(id, contentsRef.current[id] ?? '')
    restoreWorkspaceDocumentView(id)
    focusEditorSoon()
  }, [activeFileIdRef, captureWorkspaceDocumentView, contentsRef, flushEditorContent, focusEditorSoon, latestWorkspaceSelectionRef, openFilesRef, replaceEditorContent, restoreWorkspaceDocumentView, setActiveFileId, setDocTitle, titleRef])
  const opening = useDocumentTabOpening({
    state, titleRef, flushEditorContent, replaceEditorContent, pinPreviewTab,
    discardPreviewTab: closing.discardPreviewTab, switchFile, focusEditorSoon, recordRecent, setToast,
    latestWorkspaceSelectionRef, openingWorkspaceFilesRef,
  })
  return {
    ...closing,
    ...opening,
    switchFile,
    captureWorkspaceDocumentView,
    restoreWorkspaceDocumentView,
  }
}
