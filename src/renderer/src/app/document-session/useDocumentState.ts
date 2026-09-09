import { useMemo, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { OpenFile } from '../../components/Sidebar'
import { DEMO_FILES, DEFAULT_FILE_ID } from '../../data/demo-files'
import { INITIAL_CONTENTS, INITIAL_FILES, INITIAL_SAVED } from '../constants'
import type { DocumentEncoding, DocumentRecord } from './document-record'

export interface ActiveDocumentState {
  activeFile: OpenFile | undefined
  activeContent: string
  saved: boolean
}

export interface DocumentState extends ActiveDocumentState {
  /** 统一文档记录视图（id → DocumentRecord），由五字典派生 */
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

/**
 * DocumentRecord 镜像视图（Task 7 阶段 A）：由现有五字典 + 基线 ref 派生，
 * 作为统一文档记录的只读消费入口。字段口径：
 * - content 镜像 contents；savedContent 取 INITIAL_OR_SAVED（磁盘确认基线）；
 * - dirty 沿用 savedMap 权威口径（外部冲突等流程会显式维护），不做二次比较；
 * - draftState 统一 none：草稿恢复信号由恢复任务接入后再标注。
 */
export const buildDocumentRecords = (
  openFiles: OpenFile[],
  contents: Record<string, string>,
  savedMap: Record<string, boolean>,
  fileMtime: Record<string, number>,
  encodingMap: Record<string, string>,
  savedBaseline?: Record<string, string>,
): Record<string, DocumentRecord> => {
  const records: Record<string, DocumentRecord> = {}
  for (const file of openFiles) {
    const encoding = encodingMap[file.id]
    const baseline = savedBaseline?.[file.id] ?? ''
    records[file.id] = {
      id: file.id,
      path: file.path,
      name: file.name,
      content: contents[file.id] ?? '',
      savedContent: baseline,
      modifiedTime: fileMtime[file.id],
      encoding: (encoding as DocumentEncoding | undefined) ?? 'UTF-8',
      dirty: savedMap[file.id] === false,
      pinned: file.pinned === true,
      preview: file.preview === true,
      draftState: 'none',
    }
  }
  return records
}

export const useDocumentState = (): DocumentState => {
  const [openFiles, setOpenFiles] = useState<OpenFile[]>(INITIAL_FILES)
  const [contents, setContents] = useState<Record<string, string>>(INITIAL_CONTENTS)
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>(INITIAL_SAVED)
  const [activeFileId, setActiveFileId] = useState(DEFAULT_FILE_ID)
  const [docTitle, setDocTitle] = useState(DEMO_FILES[DEFAULT_FILE_ID].name)
  const [fileMtime, setFileMtime] = useState<Record<string, number>>({})
  const [encodingMap, setEncodingMap] = useState<Record<string, string>>({})

  const activeFileIdRef = useRef(activeFileId)
  const contentsRef = useRef(contents)
  contentsRef.current = contents
  const openFilesRef = useRef(openFiles)
  openFilesRef.current = openFiles
  const fileMtimeRef = useRef(fileMtime)
  fileMtimeRef.current = fileMtime
  const encodingMapRef = useRef(encodingMap)
  encodingMapRef.current = encodingMap
  const initialOrSavedRef = useRef<Record<string, string>>({ ...INITIAL_CONTENTS })
  const activeDocument = getActiveDocumentState(openFiles, contents, savedMap, activeFileId)
  const documents = useMemo(
    () =>
      buildDocumentRecords(
        openFiles,
        contents,
        savedMap,
        fileMtime,
        encodingMap,
        initialOrSavedRef.current,
      ),
    [openFiles, contents, savedMap, fileMtime, encodingMap],
  )

  return {
    ...activeDocument,
    /** 统一文档记录视图（Task 4 DocumentRecord）；与五字典同步派生 */
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
    fileMtimeRef,
    encodingMapRef,
    initialOrSavedRef,
  }
}
