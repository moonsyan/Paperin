import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { EditorHandle } from '../components/Editor'
import { createDocumentFromTemplate } from '../lib/document-collection'
import type { DocumentTemplate } from '../lib/document-collection'
import type { PublishScope } from '../lib/export-bundle'
import type { WorkspaceIndex } from '../../../shared/workspace-index'
import { resolveCollectionEntries } from './resolve-collection-entries'

interface DocumentCreationAndCollectionOptions {
  activeFileIdRef: MutableRefObject<string>
  editorRef: RefObject<EditorHandle>
  handleNew: () => void
  setContents: Dispatch<SetStateAction<Record<string, string>>>
  setSavedMap: Dispatch<SetStateAction<Record<string, boolean>>>
  workspaceIndex: WorkspaceIndex | null
  documents: Record<string, { path?: string }>
}

/** 新文档模板只进入编辑会话；集合导出从当前文档路径读取独立文件。 */
export function useDocumentCreationAndCollection({
  activeFileIdRef, editorRef, handleNew, setContents, setSavedMap, workspaceIndex, documents,
}: DocumentCreationAndCollectionOptions) {
  const handleNewFromTemplate = useCallback((template: DocumentTemplate) => {
    const content = createDocumentFromTemplate(template, {})
    handleNew()
    const newId = activeFileIdRef.current
    if (!newId) return
    setContents((previous) => ({ ...previous, [newId]: content }))
    setSavedMap((previous) => ({ ...previous, [newId]: false }))
    editorRef.current?.replaceContent(content)
  }, [activeFileIdRef, editorRef, handleNew, setContents, setSavedMap])

  const resolveCollectionEntriesFn = useCallback(async (scope: Exclude<PublishScope, { kind: 'document' }>) => {
    if (!window.desktopAPI) throw new Error('当前环境不支持集合导出')
    return resolveCollectionEntries(scope, {
      workspaceIndex,
      activePath: documents[activeFileIdRef.current]?.path ?? '',
      readDocument: (path) => window.desktopAPI.document.read(path),
    })
  }, [activeFileIdRef, documents, workspaceIndex])

  return { handleNewFromTemplate, resolveCollectionEntriesFn }
}
