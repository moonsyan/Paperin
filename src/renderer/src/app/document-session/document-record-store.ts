import { createDocumentRecord } from './document-record'
import type { OpenFile } from '../../components/Sidebar'
import type { DocumentEncoding, DocumentRecord } from './document-record'

type StringMap = Record<string, string>
type BooleanMap = Record<string, boolean>
type NumberMap = Record<string, number>

export interface DocumentRecordMaps {
  contents: StringMap
  savedMap: BooleanMap
  fileMtime: NumberMap
  encodingMap: StringMap
}

const isDocumentEncoding = (value: string | undefined): value is DocumentEncoding =>
  value === 'UTF-8' ||
  value === 'UTF-8-BOM' ||
  value === 'UTF-16LE' ||
  value === 'UTF-16BE' ||
  value === 'GBK'

const findOpenFile = (openFiles: OpenFile[], id: string): OpenFile | undefined =>
  openFiles.find((file) => file.id === id)

const createRecord = (
  id: string,
  content: string,
  openFiles: OpenFile[],
  savedBaselines: StringMap,
): DocumentRecord => {
  const file = findOpenFile(openFiles, id)
  return createDocumentRecord({
    id,
    name: file?.name ?? id,
    path: file?.path,
    content: savedBaselines[id] ?? content,
    pinned: file?.pinned,
    preview: file?.preview,
  })
}

const ensureRecord = (
  documents: Record<string, DocumentRecord>,
  id: string,
  openFiles: OpenFile[],
  savedBaselines: StringMap,
): DocumentRecord =>
  documents[id] ?? createRecord(id, '', openFiles, savedBaselines)

/** Build the single mutable session store from legacy projections during migration. */
export const createDocumentRecordStore = (
  contents: StringMap,
  savedMap: BooleanMap,
  fileMtime: NumberMap,
  encodingMap: StringMap,
  openFiles: OpenFile[],
  savedBaselines: StringMap,
): Record<string, DocumentRecord> => {
  const ids = new Set([
    ...Object.keys(contents),
    ...Object.keys(savedMap),
    ...Object.keys(fileMtime),
    ...Object.keys(encodingMap),
    ...openFiles.map((file) => file.id),
  ])
  const documents: Record<string, DocumentRecord> = {}
  ids.forEach((id) => {
    const file = findOpenFile(openFiles, id)
    const content = contents[id] ?? ''
    const savedContent = savedBaselines[id] ?? content
    const encoding = encodingMap[id]
    documents[id] = {
      id,
      name: file?.name ?? id,
      path: file?.path,
      content,
      savedContent,
      modifiedTime: fileMtime[id],
      encoding: isDocumentEncoding(encoding) ? encoding : undefined,
      dirty: savedMap[id] === false,
      pinned: file?.pinned === true,
      preview: file?.preview === true,
      draftState: 'none',
    }
  })
  return documents
}

/** Contents own record lifetime: deleting a content key closes that session record. */
export const applyContentMap = (
  documents: Record<string, DocumentRecord>,
  contents: StringMap,
  openFiles: OpenFile[],
  savedBaselines: StringMap,
): Record<string, DocumentRecord> => {
  const next: Record<string, DocumentRecord> = {}
  for (const [id, content] of Object.entries(contents)) {
    const record = ensureRecord(documents, id, openFiles, savedBaselines)
    next[id] = {
      ...record,
      content,
      dirty: content !== record.savedContent,
    }
  }
  return next
}

export const applySavedMap = (
  documents: Record<string, DocumentRecord>,
  savedMap: BooleanMap,
  openFiles: OpenFile[],
  savedBaselines: StringMap,
): Record<string, DocumentRecord> => {
  const next = { ...documents }
  for (const [id, saved] of Object.entries(savedMap)) {
    const record = ensureRecord(next, id, openFiles, savedBaselines)
    next[id] = {
      ...record,
      savedContent: savedBaselines[id] ?? (saved ? record.content : record.savedContent),
      dirty: !saved,
    }
  }
  return next
}

export const applyModifiedTimeMap = (
  documents: Record<string, DocumentRecord>,
  fileMtime: NumberMap,
  openFiles: OpenFile[],
  savedBaselines: StringMap,
): Record<string, DocumentRecord> => {
  const next: Record<string, DocumentRecord> = {}
  for (const [id, record] of Object.entries(documents)) {
    next[id] = { ...record, modifiedTime: fileMtime[id] }
  }
  for (const [id, modifiedTime] of Object.entries(fileMtime)) {
    if (next[id]) continue
    next[id] = {
      ...ensureRecord(documents, id, openFiles, savedBaselines),
      modifiedTime,
    }
  }
  return next
}

export const applyEncodingMap = (
  documents: Record<string, DocumentRecord>,
  encodingMap: StringMap,
  openFiles: OpenFile[],
  savedBaselines: StringMap,
): Record<string, DocumentRecord> => {
  const next: Record<string, DocumentRecord> = {}
  for (const [id, record] of Object.entries(documents)) {
    const encoding = encodingMap[id]
    next[id] = { ...record, encoding: isDocumentEncoding(encoding) ? encoding : undefined }
  }
  for (const [id, encoding] of Object.entries(encodingMap)) {
    if (next[id] || !isDocumentEncoding(encoding)) continue
    next[id] = {
      ...ensureRecord(documents, id, openFiles, savedBaselines),
      encoding,
    }
  }
  return next
}

export const projectDocumentMaps = (
  documents: Record<string, DocumentRecord>,
): DocumentRecordMaps => {
  const maps: DocumentRecordMaps = {
    contents: {},
    savedMap: {},
    fileMtime: {},
    encodingMap: {},
  }
  for (const [id, record] of Object.entries(documents)) {
    maps.contents[id] = record.content
    maps.savedMap[id] = !record.dirty
    if (record.modifiedTime !== undefined) maps.fileMtime[id] = record.modifiedTime
    if (record.encoding !== undefined) maps.encodingMap[id] = record.encoding
  }
  return maps
}

export const selectOpenDocumentRecords = (
  documents: Record<string, DocumentRecord>,
  openFiles: OpenFile[],
  savedBaselines: StringMap,
): Record<string, DocumentRecord> => {
  const selected: Record<string, DocumentRecord> = {}
  for (const file of openFiles) {
    const record = ensureRecord(documents, file.id, openFiles, savedBaselines)
    selected[file.id] = {
      ...record,
      name: file.name,
      path: file.path,
      encoding: record.encoding ?? 'UTF-8',
      pinned: file.pinned === true,
      preview: file.preview === true,
    }
  }
  return selected
}
