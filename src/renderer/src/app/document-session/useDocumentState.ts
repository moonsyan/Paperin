import { useCallback, useMemo, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { OpenFile } from '../../components/Sidebar'
import { DEMO_FILES, DEFAULT_FILE_ID } from '../../data/demo-files'
import { INITIAL_CONTENTS, INITIAL_FILES, INITIAL_SAVED } from '../constants'
import {
  applyContentMap,
  applyEncodingMap,
  applyModifiedTimeMap,
  applySavedMap,
  createDocumentRecordStore,
  projectDocumentMaps,
  selectOpenDocumentRecords,
} from './document-record-store'
import type { DocumentRecord } from './document-record'

export interface ActiveDocumentState {
  activeFile: OpenFile | undefined
  activeContent: string
  saved: boolean
}

export interface DocumentState extends ActiveDocumentState {
  /** 当前打开文档的统一记录视图（id → DocumentRecord） */
  documents: Record<string, DocumentRecord>
  /** 当前活动文档的记录；无活动标签时为 undefined */
  activeDocument: DocumentRecord | undefined
  openFiles: OpenFile[]
  contents: Record<string, string>
  savedMap: Record<string, boolean>
  activeFileId: string
  docTitle: string
  fileMtime: Record<string, number>
  encodingMap: Record<string, string>
  setOpenFiles: Dispatch<SetStateAction<OpenFile[]>>
  setContents: Dispatch<SetStateAction<Record<string, string>>>
  setSavedMap: Dispatch<SetStateAction<Record<string, boolean>>>
  setActiveFileId: Dispatch<SetStateAction<string>>
  setDocTitle: Dispatch<SetStateAction<string>>
  setFileMtime: Dispatch<SetStateAction<Record<string, number>>>
  setEncodingMap: Dispatch<SetStateAction<Record<string, string>>>
  openFilesRef: MutableRefObject<OpenFile[]>
  contentsRef: MutableRefObject<Record<string, string>>
  activeFileIdRef: MutableRefObject<string>
  /** 每次切换活动编辑会话递增，异步保存据此拒绝 A→B→A 的旧快照。 */
  activeSessionRef: MutableRefObject<number>
  fileMtimeRef: MutableRefObject<Record<string, number>>
  encodingMapRef: MutableRefObject<Record<string, string>>
  initialOrSavedRef: MutableRefObject<Record<string, string>>
}

export const getActiveDocumentState = (
  openFiles: OpenFile[],
  contents: Record<string, string>,
  savedMap: Record<string, boolean>,
  activeFileId: string,
): ActiveDocumentState => {
  if (openFiles.length === 0) {
    return { activeFile: undefined, activeContent: '', saved: true }
  }

  return {
    activeFile: openFiles.find((file) => file.id === activeFileId),
    activeContent: contents[activeFileId] ?? '',
    saved: savedMap[activeFileId] ?? true,
  }
}

/** 兼容旧调用的纯构造器；真实 hook 已以 DocumentRecord store 为状态源。 */
export const buildDocumentRecords = (
  openFiles: OpenFile[],
  contents: Record<string, string>,
  savedMap: Record<string, boolean>,
  fileMtime: Record<string, number>,
  encodingMap: Record<string, string>,
  savedBaseline?: Record<string, string>,
): Record<string, DocumentRecord> => {
  const baselines = savedBaseline ?? {}
  return selectOpenDocumentRecords(
    createDocumentRecordStore(
      contents,
      savedMap,
      fileMtime,
      encodingMap,
      openFiles,
      baselines,
    ),
    openFiles,
    baselines,
  )
}

const resolveStateAction = <T,>(action: SetStateAction<T>, previous: T): T =>
  typeof action === 'function' ? (action as (value: T) => T)(previous) : action

export const useDocumentState = (): DocumentState => {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>(INITIAL_FILES)
  const openFilesRef = useRef(openFiles)
  openFilesRef.current = openFiles
  const initialOrSavedRef = useRef<Record<string, string>>({ ...INITIAL_CONTENTS })
  const [documentStore, setDocumentStore] = useState<Record<string, DocumentRecord>>(() =>
    createDocumentRecordStore(
      INITIAL_CONTENTS,
      INITIAL_SAVED,
      {},
      {},
      INITIAL_FILES,
      initialOrSavedRef.current,
    ),
  )
  const [activeFileId, setActiveFileIdState] = useState(DEFAULT_FILE_ID)
  const activeSessionRef = useRef(0)
  const setActiveFileId: Dispatch<SetStateAction<string>> = useCallback((action) => {
    setActiveFileIdState((previous) => {
      const next = resolveStateAction(action, previous)
      if (next !== previous) activeSessionRef.current++
      return next
    })
  }, [])
  const [docTitle, setDocTitle] = useState(DEMO_FILES[DEFAULT_FILE_ID].name)

  const { contents, savedMap, fileMtime, encodingMap } = useMemo(
    () => projectDocumentMaps(documentStore),
    [documentStore],
  )

  const activeFileIdRef = useRef(activeFileId)
  activeFileIdRef.current = activeFileId
  const contentsRef = useRef(contents)
  contentsRef.current = contents
  const fileMtimeRef = useRef(fileMtime)
  fileMtimeRef.current = fileMtime
  const encodingMapRef = useRef(encodingMap)
  encodingMapRef.current = encodingMap

  const setContents: Dispatch<SetStateAction<Record<string, string>>> = useCallback((action) => {
    setDocumentStore((previous) => {
      const next = resolveStateAction(action, projectDocumentMaps(previous).contents)
      return applyContentMap(previous, next, openFilesRef.current, initialOrSavedRef.current)
    })
  }, [])
  const setSavedMap: Dispatch<SetStateAction<Record<string, boolean>>> = useCallback((action) => {
    setDocumentStore((previous) => {
      const next = resolveStateAction(action, projectDocumentMaps(previous).savedMap)
      return applySavedMap(previous, next, openFilesRef.current, initialOrSavedRef.current)
    })
  }, [])
  const setFileMtime: Dispatch<SetStateAction<Record<string, number>>> = useCallback((action) => {
    setDocumentStore((previous) => {
      const next = resolveStateAction(action, projectDocumentMaps(previous).fileMtime)
      return applyModifiedTimeMap(previous, next, openFilesRef.current, initialOrSavedRef.current)
    })
  }, [])
  const setEncodingMap: Dispatch<SetStateAction<Record<string, string>>> = useCallback((action) => {
    setDocumentStore((previous) => {
      const next = resolveStateAction(action, projectDocumentMaps(previous).encodingMap)
      return applyEncodingMap(previous, next, openFilesRef.current, initialOrSavedRef.current)
    })
  }, [])

  const activeDocument = getActiveDocumentState(openFiles, contents, savedMap, activeFileId)
  const documents = useMemo(
    () => selectOpenDocumentRecords(documentStore, openFiles, initialOrSavedRef.current),
    [documentStore, openFiles],
  )

  return {
    ...activeDocument,
    /** contents/savedMap/mtime/encoding 均由同一 store 投影，不再独立持有。 */
    documents,
    activeDocument: documents[activeFileId],
    openFiles,
    contents,
    savedMap,
    activeFileId,
    docTitle,
    fileMtime,
    encodingMap,
    setOpenFiles,
    setContents,
    setSavedMap,
    setActiveFileId,
    setDocTitle,
    setFileMtime,
    setEncodingMap,
    openFilesRef,
    contentsRef,
    activeFileIdRef,
    activeSessionRef,
    fileMtimeRef,
    encodingMapRef,
    initialOrSavedRef,
  }
}
