import { useCallback, useRef } from 'react'
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
import { waitForLeaveSnapshot } from './ensure-snapshot'

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
  switchFile: (id: string) => Promise<void>
  leaveCurrentDocument: () => Promise<boolean>
  handleNew: () => Promise<void>
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
  const leaveCurrentDocument = useCallback(async (): Promise<boolean> => {
    const leavingId = activeFileIdRef.current
    const settled = await waitForLeaveSnapshot({
      hasPendingChanges: () => editorRef.current?.hasPendingChanges() ?? false,
      readSnapshot: () => contentsRef.current[leavingId] ?? '',
      isTargetCurrent: () => activeFileIdRef.current === leavingId,
    }, contentsRef.current[leavingId] ?? '')
    if (!settled) {
      if (activeFileIdRef.current === leavingId) {
        setToast('大文档仍有未落账输入，已取消操作')
      }
      return false
    }
    flushEditorContent()
    return true
  }, [activeFileIdRef, contentsRef, editorRef, flushEditorContent, setToast])
  const switchGenerationRef = useRef(0)
  const switchFile = useCallback(async (id: string) => {
    if (id === activeFileIdRef.current) return
    latestWorkspaceSelectionRef.current = ''
    if (!openFilesRef.current.some((file) => file.id === id)) return
    const requestId = ++switchGenerationRef.current
    const leavingId = activeFileIdRef.current
    captureWorkspaceDocumentView(leavingId)
    const settled = await waitForLeaveSnapshot({
      hasPendingChanges: () => editorRef.current?.hasPendingChanges() ?? false,
      readSnapshot: () => contentsRef.current[leavingId] ?? '',
      isTargetCurrent: () =>
        activeFileIdRef.current === leavingId && requestId === switchGenerationRef.current,
    }, contentsRef.current[leavingId] ?? '')
    if (requestId !== switchGenerationRef.current) return
    if (!settled) {
      if (activeFileIdRef.current === leavingId) {
        setToast('大文档仍有未落账输入，已取消切换')
      }
      return
    }
    if (id === activeFileIdRef.current) return
    if (!openFilesRef.current.some((file) => file.id === id)) return
    if (activeFileIdRef.current === leavingId) flushEditorContent()
    titleRef.current?.blur()
    activeFileIdRef.current = id
    setActiveFileId(id)
    const file = openFilesRef.current.find((candidate) => candidate.id === id)
    setDocTitle(file?.name ?? '未命名文档')
    replaceEditorContent(id, contentsRef.current[id] ?? '')
    restoreWorkspaceDocumentView(id)
    focusEditorSoon()
  }, [activeFileIdRef, captureWorkspaceDocumentView, contentsRef, editorRef, flushEditorContent, focusEditorSoon, latestWorkspaceSelectionRef, openFilesRef, replaceEditorContent, restoreWorkspaceDocumentView, setActiveFileId, setDocTitle, setToast, titleRef])
  const opening = useDocumentTabOpening({
    state, titleRef, replaceEditorContent, pinPreviewTab,
    discardPreviewTab: closing.discardPreviewTab, switchFile, leaveCurrentDocument, focusEditorSoon, recordRecent, setToast,
    latestWorkspaceSelectionRef, openingWorkspaceFilesRef,
  })
  return {
    ...closing,
    ...opening,
    switchFile,
    leaveCurrentDocument,
    captureWorkspaceDocumentView,
    restoreWorkspaceDocumentView,
  }
}
