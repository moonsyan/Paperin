import { normalizeWorkspaceRelativePath } from './workspace-state'

/** 旧工作区全局快照上限（迁移后保留为归属未知，不复制给文章）。 */
export const MAX_LEGACY_SOURCE_SNAPSHOTS = 50
/** 最多跟踪多少篇引用文档的来源基线。 */
export const MAX_SOURCE_BASELINE_DOCUMENTS = 50
/** 每篇引用文档最多保留多少条来源基线。 */
export const MAX_SOURCE_BASELINES_PER_DOCUMENT = 20
/** 全部文档来源基线条数上限。 */
export const MAX_TOTAL_DOCUMENT_SOURCE_BASELINES = 200

const EPHEMERAL_CITING_PREFIX = '@unsaved:'

export interface DocumentSourceBaseline {
  /** 引用文档的工作区相对路径；未保存会话使用 @unsaved:<documentId>，不写入状态文件。 */
  citingDocumentPath: string
  sourcePath: string
  modifiedTime: number
}

export interface LegacySourceSnapshot {
  path: string
  modifiedTime: number
}

export interface SourceTrackingEditorSlice {
  documentSourceBaselines: DocumentSourceBaseline[]
  legacySourceSnapshots: LegacySourceSnapshot[]
}

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isEphemeralCitingDocumentKey = (value: string): boolean =>
  value.startsWith(EPHEMERAL_CITING_PREFIX)

export const ephemeralCitingDocumentKey = (documentId: string): string =>
  `${EPHEMERAL_CITING_PREFIX}${documentId}`

export const isPersistableCitingDocumentPath = (value: string): boolean =>
  !isEphemeralCitingDocumentKey(value) && normalizeWorkspaceRelativePath(value) !== null

const normalizeSourcePath = (value: string): string | null => normalizeWorkspaceRelativePath(value)

const baselineKey = (citingDocumentPath: string, sourcePath: string): string =>
  `${citingDocumentPath}\0${sourcePath}`

/** Windows 等平台路径比较：调用方传入是否大小写不敏感。 */
export const workspaceRelativePathsEqual = (
  left: string,
  right: string,
  caseInsensitive: boolean,
): boolean => {
  const a = left.replace(/\\/g, '/')
  const b = right.replace(/\\/g, '/')
  return caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b
}

const parseBaselineCandidate = (value: unknown): DocumentSourceBaseline | null => {
  if (!isRecord(value)) return null
  if (typeof value.citingDocumentPath !== 'string' || typeof value.sourcePath !== 'string') return null
  if (typeof value.modifiedTime !== 'number' || !Number.isFinite(value.modifiedTime)) return null
  const citingDocumentPath = value.citingDocumentPath.trim()
  const sourcePath = normalizeSourcePath(value.sourcePath)
  if (!sourcePath) return null
  if (isEphemeralCitingDocumentKey(citingDocumentPath)) return null
  const citingPath = normalizeWorkspaceRelativePath(citingDocumentPath)
  if (!citingPath) return null
  return { citingDocumentPath: citingPath, sourcePath, modifiedTime: value.modifiedTime }
}

const parseLegacyCandidate = (value: unknown): LegacySourceSnapshot | null => {
  if (!isRecord(value) || typeof value.path !== 'string') return null
  if (typeof value.modifiedTime !== 'number' || !Number.isFinite(value.modifiedTime)) return null
  const path = normalizeSourcePath(value.path)
  if (!path) return null
  return { path, modifiedTime: value.modifiedTime }
}

const trimDocumentBaselines = (items: DocumentSourceBaseline[]): DocumentSourceBaseline[] => {
  const trimmed: DocumentSourceBaseline[] = []
  const perDocumentCount = new Map<string, number>()
  const trackedDocuments = new Set<string>()
  for (const item of items) {
    if (trimmed.length >= MAX_TOTAL_DOCUMENT_SOURCE_BASELINES) break
    if (
      !trackedDocuments.has(item.citingDocumentPath)
      && trackedDocuments.size >= MAX_SOURCE_BASELINE_DOCUMENTS
    ) {
      continue
    }
    const used = perDocumentCount.get(item.citingDocumentPath) ?? 0
    if (used >= MAX_SOURCE_BASELINES_PER_DOCUMENT) continue
    trimmed.push(item)
    trackedDocuments.add(item.citingDocumentPath)
    perDocumentCount.set(item.citingDocumentPath, used + 1)
  }
  return trimmed
}

export const parseSourceTrackingFromEditor = (
  editor: UnknownRecord | null,
): SourceTrackingEditorSlice => {
  const requestedBaselines = Array.isArray(editor?.documentSourceBaselines)
    ? editor.documentSourceBaselines
    : []
  const documentSourceBaselines: DocumentSourceBaseline[] = []
  const seenBaseline = new Set<string>()
  for (const candidate of requestedBaselines) {
    const parsed = parseBaselineCandidate(candidate)
    if (!parsed) continue
    const key = baselineKey(parsed.citingDocumentPath, parsed.sourcePath)
    if (seenBaseline.has(key)) continue
    seenBaseline.add(key)
    documentSourceBaselines.unshift(parsed)
  }

  const requestedLegacy = Array.isArray(editor?.legacySourceSnapshots)
    ? editor.legacySourceSnapshots
    : []
  const legacySourceSnapshots: LegacySourceSnapshot[] = []
  const seenLegacy = new Set<string>()
  for (const candidate of requestedLegacy) {
    const parsed = parseLegacyCandidate(candidate)
    if (!parsed || seenLegacy.has(parsed.path)) continue
    seenLegacy.add(parsed.path)
    legacySourceSnapshots.push(parsed)
    if (legacySourceSnapshots.length >= MAX_LEGACY_SOURCE_SNAPSHOTS) break
  }

  // 旧 schema：全局 sourceSnapshots 迁移为归属未知，不复制给任何文章。
  const legacyFromOldSchema = Array.isArray(editor?.sourceSnapshots) ? editor.sourceSnapshots : []
  for (const candidate of legacyFromOldSchema) {
    if (legacySourceSnapshots.length >= MAX_LEGACY_SOURCE_SNAPSHOTS) break
    const parsed = parseLegacyCandidate(candidate)
    if (!parsed || seenLegacy.has(parsed.path)) continue
    seenLegacy.add(parsed.path)
    legacySourceSnapshots.push(parsed)
  }

  return {
    documentSourceBaselines: trimDocumentBaselines(documentSourceBaselines),
    legacySourceSnapshots,
  }
}

export const rememberDocumentSourceBaseline = (
  current: readonly DocumentSourceBaseline[],
  baseline: DocumentSourceBaseline,
): DocumentSourceBaseline[] => {
  const sourcePath = normalizeSourcePath(baseline.sourcePath)
  if (!sourcePath || !Number.isFinite(baseline.modifiedTime)) return [...current]
  const citingDocumentPath = isEphemeralCitingDocumentKey(baseline.citingDocumentPath)
    ? baseline.citingDocumentPath
    : normalizeWorkspaceRelativePath(baseline.citingDocumentPath)
  if (!citingDocumentPath) return [...current]

  const nextEntry: DocumentSourceBaseline = {
    citingDocumentPath,
    sourcePath,
    modifiedTime: baseline.modifiedTime,
  }
  const filtered = current.filter(
    (item) => baselineKey(item.citingDocumentPath, item.sourcePath) !== baselineKey(citingDocumentPath, sourcePath),
  )
  return trimDocumentBaselines([nextEntry, ...filtered])
}

export const baselinesForCitingDocument = (
  baselines: readonly DocumentSourceBaseline[],
  citingDocumentPath: string,
  caseInsensitive: boolean,
): DocumentSourceBaseline[] =>
  baselines.filter((item) =>
    workspaceRelativePathsEqual(item.citingDocumentPath, citingDocumentPath, caseInsensitive),
  )

export const persistableBaselines = (
  baselines: readonly DocumentSourceBaseline[],
): DocumentSourceBaseline[] =>
  baselines.filter((item) => isPersistableCitingDocumentPath(item.citingDocumentPath))

export const rebindEphemeralCitingDocument = (
  baselines: readonly DocumentSourceBaseline[],
  documentId: string,
  newRelativePath: string,
): DocumentSourceBaseline[] => {
  const citingPath = normalizeWorkspaceRelativePath(newRelativePath)
  if (!citingPath) return [...baselines]
  const ephemeralKey = ephemeralCitingDocumentKey(documentId)
  const rebound = baselines.map((item) =>
    item.citingDocumentPath === ephemeralKey
      ? { ...item, citingDocumentPath: citingPath }
      : item,
  )
  return trimDocumentBaselines(rebound)
}

export const remapSourceTrackingPath = (
  slice: SourceTrackingEditorSlice,
  oldRelativePath: string,
  newRelativePath: string,
  caseInsensitive: boolean,
): SourceTrackingEditorSlice => {
  const nextPath = normalizeWorkspaceRelativePath(newRelativePath)
  const oldPath = normalizeWorkspaceRelativePath(oldRelativePath)
  if (!nextPath || !oldPath) return slice

  const mapPath = (path: string): string => {
    if (workspaceRelativePathsEqual(path, oldPath, caseInsensitive)) return nextPath
    return path
  }

  const documentSourceBaselines = slice.documentSourceBaselines.map((item) => ({
    citingDocumentPath: mapPath(item.citingDocumentPath),
    sourcePath: mapPath(item.sourcePath),
    modifiedTime: item.modifiedTime,
  }))
  const legacySourceSnapshots = slice.legacySourceSnapshots.map((item) => ({
    path: mapPath(item.path),
    modifiedTime: item.modifiedTime,
  }))
  return {
    documentSourceBaselines: trimDocumentBaselines(documentSourceBaselines),
    legacySourceSnapshots,
  }
}

export interface ReviewSourceBaselineInput {
  sourcePath: string
  modifiedTime: number
}

/** 复核：只更新所选引用文档的来源基线，不影响其他文章。 */
export const reviewCitingDocumentBaselines = (
  current: readonly DocumentSourceBaseline[],
  citingDocumentPath: string,
  reviews: readonly ReviewSourceBaselineInput[],
  caseInsensitive: boolean,
): DocumentSourceBaseline[] => {
  if (!isPersistableCitingDocumentPath(citingDocumentPath)) return [...current]
  const reviewBySource = new Map<string, number>()
  for (const review of reviews) {
    const sourcePath = normalizeSourcePath(review.sourcePath)
    if (!sourcePath || !Number.isFinite(review.modifiedTime)) continue
    reviewBySource.set(sourcePath, review.modifiedTime)
  }
  if (reviewBySource.size === 0) return [...current]

  return trimDocumentBaselines(
    current.map((item) => {
      if (!workspaceRelativePathsEqual(item.citingDocumentPath, citingDocumentPath, caseInsensitive)) {
        return item
      }
      const reviewedTime = reviewBySource.get(item.sourcePath)
      if (reviewedTime === undefined) return item
      return { ...item, modifiedTime: reviewedTime }
    }),
  )
}

export const clearLegacySourceSnapshots = (
  slice: SourceTrackingEditorSlice,
): SourceTrackingEditorSlice => ({
  ...slice,
  legacySourceSnapshots: [],
})

export const clearDocumentSourceBaselines = (
  slice: SourceTrackingEditorSlice,
): SourceTrackingEditorSlice => ({
  ...slice,
  documentSourceBaselines: [],
})

export const clearAllSourceRelations = (
  _slice: SourceTrackingEditorSlice,
): SourceTrackingEditorSlice => ({
  documentSourceBaselines: [],
  legacySourceSnapshots: [],
})

/** 显式重定位：只更新所选引用文档内的一条来源基线，不改正文、不覆盖其他文章。 */
export const relocateCitingDocumentSourceBaseline = (
  current: readonly DocumentSourceBaseline[],
  citingDocumentPath: string,
  previousSourcePath: string,
  newSourcePath: string,
  newModifiedTime: number,
  caseInsensitive: boolean,
): DocumentSourceBaseline[] => {
  const previousPath = normalizeSourcePath(previousSourcePath)
  const selectedPath = normalizeSourcePath(newSourcePath)
  if (!previousPath || !selectedPath || !Number.isFinite(newModifiedTime)) return [...current]

  const filtered = current.filter((item) => {
    if (!workspaceRelativePathsEqual(item.citingDocumentPath, citingDocumentPath, caseInsensitive)) {
      return true
    }
    if (workspaceRelativePathsEqual(item.sourcePath, previousPath, caseInsensitive)) return false
    if (workspaceRelativePathsEqual(item.sourcePath, selectedPath, caseInsensitive)) return false
    return true
  })

  return rememberDocumentSourceBaseline(filtered, {
    citingDocumentPath,
    sourcePath: selectedPath,
    modifiedTime: newModifiedTime,
  })
}
