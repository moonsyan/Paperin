import { useCallback } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { sameFilePath } from './filePath'
import { DEMO_FILES } from '../../data/demo-files'
import { nextUntitled } from '../constants'
import type { OpenFile } from '../../components/Sidebar'
import type { DocumentState } from './useDocumentState'

interface DocumentTabOpeningOptions {
  state: DocumentState
  titleRef: RefObject<HTMLDivElement>
  replaceEditorContent: (fileId: string, content: string, mode?: 'initialize' | 'update' | 'ignore') => void
  pinPreviewTab: (fileId: string) => void
  discardPreviewTab: (fileId: string) => void
  switchFile: (id: string) => void | Promise<void>
  leaveCurrentDocument: () => Promise<boolean>
  focusEditorSoon: () => void
  recordRecent: (path: string, name: string) => void
  setToast: (message: string) => void
  latestWorkspaceSelectionRef: MutableRefObject<string>
  openingWorkspaceFilesRef: MutableRefObject<Map<string, Promise<boolean>>>
}

export interface DocumentTabOpeningApi {
  handleNew: () => Promise<void>
  handleSelectDemoFile: (id: string, pinned?: boolean) => void
  handleOpen: () => Promise<void>
  handleSelectWorkspaceFile: (path: string, pinned?: boolean) => Promise<boolean>
}

/** 创建、选择和读取文档。它不决定关闭策略或工作区视图状态。 */
export function useDocumentTabOpening({
  state,
  titleRef,
  replaceEditorContent,
  pinPreviewTab,
  discardPreviewTab,
  switchFile,
  leaveCurrentDocument,
  focusEditorSoon,
  recordRecent,
  setToast,
  latestWorkspaceSelectionRef,
  openingWorkspaceFilesRef,
}: DocumentTabOpeningOptions): DocumentTabOpeningApi {
  const {
    activeFileIdRef,
    contentsRef,
    initialOrSavedRef: initialOrSaved,
    openFiles,
    openFilesRef,
    setActiveFileId,
    setContents,
    setDocTitle,
    setEncodingMap,
    setFileMtime,
    setOpenFiles,
    setSavedMap,
  } = state

  const activateNewFile = useCallback((file: OpenFile, content: string) => {
    openFilesRef.current = [...openFilesRef.current, file]
    setOpenFiles((previous) => [...previous, file])
    setContents((previous) => ({ ...previous, [file.id]: content }))
    contentsRef.current = { ...contentsRef.current, [file.id]: content }
    setSavedMap((previous) => ({ ...previous, [file.id]: true }))
    initialOrSaved.current[file.id] = content
    activeFileIdRef.current = file.id
    setActiveFileId(file.id)
    setDocTitle(file.name)
    replaceEditorContent(file.id, content, 'initialize')
    focusEditorSoon()
  }, [activeFileIdRef, contentsRef, focusEditorSoon, initialOrSaved, openFilesRef, replaceEditorContent, setActiveFileId, setContents, setDocTitle, setOpenFiles, setSavedMap])

  const handleNew = useCallback(async () => {
    latestWorkspaceSelectionRef.current = ''
    if (!await leaveCurrentDocument()) return
    titleRef.current?.blur()
    const file = nextUntitled()
    activateNewFile(file, '')
  }, [activateNewFile, latestWorkspaceSelectionRef, leaveCurrentDocument, titleRef])

  const handleSelectDemoFile = useCallback((id: string, pinned = true) => {
    void (async () => {
      const demoFile = DEMO_FILES[id]
      if (!demoFile) return
      const existed = openFiles.find((file) => file.id === id)
      if (existed) {
        if (pinned && existed.preview) pinPreviewTab(id)
        await switchFile(id)
        return
      }
      if (!pinned) discardPreviewTab(id)
      if (!await leaveCurrentDocument()) return
      const file = { id, name: demoFile.name, preview: !pinned }
      activateNewFile(file, demoFile.content)
    })()
  }, [activateNewFile, discardPreviewTab, leaveCurrentDocument, openFiles, pinPreviewTab, switchFile])

  const handleOpen = useCallback(async () => {
    if (!window.desktopAPI) return
    latestWorkspaceSelectionRef.current = ''
    const result = await window.desktopAPI.document.open()
    if (!result.ok || !result.data) {
      if (result.error?.code === 'TOO_LARGE') {
        setToast(result.error.message ?? 'Markdown 文件超过 20MB，无法打开')
      } else if (result.error?.code !== 'CANCELLED') {
        setToast('文件打开失败')
      }
      return
    }
    const { path, name, content } = result.data
    if (result.data.encoding) setEncodingMap((previous) => ({ ...previous, [`file-${path}`]: result.data!.encoding! }))
    const existed = openFiles.find((file) => sameFilePath(file.path, path))
    if (existed) {
      if (existed.preview) pinPreviewTab(existed.id)
      await switchFile(existed.id)
      return
    }
    if (!await leaveCurrentDocument()) return
    titleRef.current?.blur()
    const file = { id: `file-${path}`, name, path }
    activateNewFile(file, content)
    setFileMtime((previous) => ({ ...previous, [file.id]: result.data!.modifiedTime }))
    recordRecent(path, name)
  }, [activateNewFile, latestWorkspaceSelectionRef, leaveCurrentDocument, openFiles, pinPreviewTab, recordRecent, setEncodingMap, setFileMtime, setToast, switchFile, titleRef])

  const handleSelectWorkspaceFile = useCallback(async (path: string, pinned = true): Promise<boolean> => {
    latestWorkspaceSelectionRef.current = path
    const id = `file-${path}`
    const existed = openFilesRef.current.find((file) => sameFilePath(file.path, path))
    if (existed) {
      if (pinned && existed.preview) pinPreviewTab(existed.id)
      await switchFile(existed.id)
      return true
    }
    if (!window.desktopAPI) return false
    const opening = openingWorkspaceFilesRef.current.get(path)
    if (opening) {
      const opened = await opening
      if (opened && pinned) pinPreviewTab(id)
      if (opened && latestWorkspaceSelectionRef.current === path) {
        const nowOpen = openFilesRef.current.find((file) => file.id === id)
        if (nowOpen) await switchFile(id)
      }
      return opened
    }
    const openRequest = openWorkspaceFile({
      path,
      id,
      pinned,
      state,
      titleRef,
      leaveCurrentDocument,
      replaceEditorContent,
      discardPreviewTab,
      pinPreviewTab,
      focusEditorSoon,
      recordRecent,
      setToast,
      latestWorkspaceSelectionRef,
    })
    openingWorkspaceFilesRef.current.set(path, openRequest)
    try {
      return await openRequest
    } finally {
      if (openingWorkspaceFilesRef.current.get(path) === openRequest) {
        openingWorkspaceFilesRef.current.delete(path)
      }
    }
  }, [discardPreviewTab, focusEditorSoon, latestWorkspaceSelectionRef, leaveCurrentDocument, openFilesRef, openingWorkspaceFilesRef, pinPreviewTab, recordRecent, replaceEditorContent, setToast, state, switchFile, titleRef])

  return { handleNew, handleSelectDemoFile, handleOpen, handleSelectWorkspaceFile }
}

interface OpenWorkspaceFileOptions extends Pick<DocumentTabOpeningOptions,
  'titleRef' | 'replaceEditorContent' | 'discardPreviewTab' | 'pinPreviewTab' |
  'focusEditorSoon' | 'recordRecent' | 'setToast' | 'latestWorkspaceSelectionRef' | 'leaveCurrentDocument'> {
  path: string
  id: string
  pinned: boolean
  state: DocumentState
}

const openWorkspaceFile = async ({
  path,
  id,
  pinned,
  state,
  titleRef,
  leaveCurrentDocument,
  replaceEditorContent,
  discardPreviewTab,
  pinPreviewTab,
  focusEditorSoon,
  recordRecent,
  setToast,
  latestWorkspaceSelectionRef,
}: OpenWorkspaceFileOptions): Promise<boolean> => {
  const result = await window.desktopAPI!.document.read(path)
  if (!result.ok || !result.data) {
    if (result.error?.code === 'TOO_LARGE') setToast(result.error.message ?? 'Markdown 文件超过 20MB，无法打开')
    else if (result.error?.code === 'NOT_AUTHORIZED') setToast(result.error.message ?? '文件未授权，请通过打开对话框或工作区重新打开')
    else setToast('文件读取失败')
    return false
  }
  const isLatest = latestWorkspaceSelectionRef.current === path
  const openedMeanwhile = state.openFilesRef.current.find((file) => sameFilePath(file.path, path))
  if (openedMeanwhile) {
    if (pinned && openedMeanwhile.preview) pinPreviewTab(openedMeanwhile.id)
    return isLatest
  }
  if (isLatest) {
    if (!await leaveCurrentDocument()) return false
    titleRef.current?.blur()
  }
  const { name, content } = result.data
  if (result.data.encoding) state.setEncodingMap((previous) => ({ ...previous, [id]: result.data!.encoding! }))
  if (!pinned) discardPreviewTab(id)
  const file = { id, name, path, preview: !pinned }
  state.openFilesRef.current = [...state.openFilesRef.current, file]
  state.setOpenFiles((previous) => [...previous, file])
  state.setContents((previous) => ({ ...previous, [id]: content }))
  state.contentsRef.current = { ...state.contentsRef.current, [id]: content }
  state.setSavedMap((previous) => ({ ...previous, [id]: true }))
  state.initialOrSavedRef.current[id] = content
  state.setFileMtime((previous) => ({ ...previous, [id]: result.data!.modifiedTime }))
  recordRecent(path, name)
  if (!isLatest) return false
  state.activeFileIdRef.current = id
  state.setActiveFileId(id)
  state.setDocTitle(name)
  replaceEditorContent(id, content, 'initialize')
  focusEditorSoon()
  return true
}
