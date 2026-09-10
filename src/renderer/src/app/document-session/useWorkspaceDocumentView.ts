import { useCallback } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import {
  toWorkspaceRelativePath,
  updateWorkspaceDocumentView,
} from '../../lib/workspace-state'
import type { WorkspaceDocumentsState } from '../../../../shared/workspace-state'
import type { EditorHandle } from '../../components/Editor'
import type { OpenFile } from '../../components/Sidebar'

interface WorkspaceDocumentViewOptions {
  activeFileIdRef: MutableRefObject<string>
  editorRef: RefObject<EditorHandle>
  openFilesRef: MutableRefObject<OpenFile[]>
  workspacePathRef: MutableRefObject<string | undefined>
  workspaceDocumentsRef: MutableRefObject<WorkspaceDocumentsState>
  setWorkspaceDocuments: (next: WorkspaceDocumentsState) => void
}

export interface WorkspaceDocumentViewApi {
  captureWorkspaceDocumentView: (fileId: string) => void
  restoreWorkspaceDocumentView: (fileId: string, tries?: number) => void
}

/** 工作区内文档的编辑器视图状态（选区、滚动）读写，不处理标签生命周期。 */
export function useWorkspaceDocumentView({
  activeFileIdRef,
  editorRef,
  openFilesRef,
  workspacePathRef,
  workspaceDocumentsRef,
  setWorkspaceDocuments,
}: WorkspaceDocumentViewOptions): WorkspaceDocumentViewApi {
  const captureWorkspaceDocumentView = useCallback((fileId: string) => {
    const rootPath = workspacePathRef.current
    const file = openFilesRef.current.find((candidate) => candidate.id === fileId)
    const viewState = editorRef.current?.getViewState()
    if (!rootPath || !file?.path || !viewState) return
    const nextState = updateWorkspaceDocumentView({
      state: workspaceDocumentsRef.current,
      rootPath,
      filePath: file.path,
      viewState,
      updatedAt: new Date().toISOString(),
      caseInsensitive: window.desktopAPI?.platform === 'win32',
    })
    if (nextState === workspaceDocumentsRef.current) return
    workspaceDocumentsRef.current = nextState
    setWorkspaceDocuments(nextState)
  }, [editorRef, openFilesRef, setWorkspaceDocuments, workspaceDocumentsRef, workspacePathRef])

  const restoreWorkspaceDocumentView = useCallback((fileId: string, tries = 0) => {
    if (activeFileIdRef.current !== fileId) return
    if (!editorRef.current?.isReady()) {
      if (tries < 50) {
        setTimeout(() => restoreWorkspaceDocumentView(fileId, tries + 1), 100)
      }
      return
    }
    const rootPath = workspacePathRef.current
    const file = openFilesRef.current.find((candidate) => candidate.id === fileId)
    if (!rootPath || !file?.path) return
    const relativePath = toWorkspaceRelativePath(
      rootPath,
      file.path,
      window.desktopAPI?.platform === 'win32',
    )
    if (!relativePath) return
    const viewState = workspaceDocumentsRef.current.documents[relativePath]
    if (!viewState) return
    editorRef.current.restoreViewState(viewState)
  }, [activeFileIdRef, editorRef, openFilesRef, workspaceDocumentsRef, workspacePathRef])

  return { captureWorkspaceDocumentView, restoreWorkspaceDocumentView }
}
