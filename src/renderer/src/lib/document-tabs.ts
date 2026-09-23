import type { OpenFile } from '../components/Sidebar'

export interface DocumentTabState {
  openFiles: OpenFile[]
  activeFileId: string
  contents: Record<string, string>
  savedMap: Record<string, boolean>
  savedContents: Record<string, string>
}

export const isDocumentDirty = (content: string, savedContent: string): boolean =>
  content !== savedContent

export const initializeDocumentBaseline = (
  rawContent: string,
  editorMarkdown: string | null,
): { content: string; baseline: string; saved: true } => {
  const normalizedContent = editorMarkdown ?? rawContent
  return {
    content: normalizedContent,
    baseline: normalizedContent,
    saved: true,
  }
}

/**
 * 切换到已保存文档时重新 initialize，把编辑器往返序列化结果写回基线，
 * 避免 Wiki 转换等程序性事务把标签标成 dirty。脏文档保持 ignore，以免冲掉未保存基线。
 */
export const replaceModeForSwitch = (input: { saved: boolean }): 'initialize' | 'ignore' =>
  input.saved ? 'initialize' : 'ignore'

export const pinPreviewOpenFile = (openFiles: OpenFile[], fileId: string): OpenFile[] =>
  openFiles.map((file) => (file.id === fileId && file.preview ? { ...file, preview: false } : file))

export const findDiscardablePreview = (
  openFiles: OpenFile[],
  nextFileId: string,
): OpenFile | undefined => openFiles.find((file) => file.preview && file.id !== nextFileId)

/** 活动预览仍有未落账输入或缓存未对齐时必须固定，不能直接拆掉标签。 */
export const shouldPreserveActivePreview = (input: {
  pending: boolean
  markdown: string | null
  cached: string
}): boolean => {
  if (input.pending) return true
  if (input.markdown === null) return true
  return input.markdown !== input.cached
}

export const getNeighborTabId = (openFiles: OpenFile[], fileId: string): string | null => {
  const index = openFiles.findIndex((file) => file.id === fileId)
  if (index === -1) return null
  return openFiles[index + 1]?.id ?? openFiles[index - 1]?.id ?? null
}

export const reorderTabs = (
  openFiles: OpenFile[],
  from: number,
  to: number,
): OpenFile[] => {
  if (
    from === to ||
    from < 0 ||
    from >= openFiles.length ||
    to < 0 ||
    to >= openFiles.length
  ) {
    return openFiles
  }
  const next = [...openFiles]
  const [moved] = next.splice(from, 1)
  if (!moved) return openFiles
  next.splice(to, 0, moved)
  return next
}

export const togglePinnedTab = (openFiles: OpenFile[], fileId: string): OpenFile[] => {
  const file = openFiles.find((candidate) => candidate.id === fileId)
  if (!file) return openFiles
  const updated = { ...file, pinned: file.pinned !== true, preview: false }
  const remaining = openFiles.filter((candidate) => candidate.id !== fileId)
  const firstUnpinnedIndex = remaining.findIndex((candidate) => candidate.pinned !== true)
  // 钉住/取消钉住都插到第一个非固定标签前，保持"固定标签在前"的分区
  const insertionIndex = firstUnpinnedIndex === -1 ? remaining.length : firstUnpinnedIndex
  return [
    ...remaining.slice(0, insertionIndex),
    updated,
    ...remaining.slice(insertionIndex),
  ]
}

export type CloseTabsMode = 'others' | 'all'

export const getClosableTabIds = (
  openFiles: OpenFile[],
  mode: CloseTabsMode,
  targetId: string | null,
): string[] => openFiles
  .filter((file) => {
    if (file.pinned === true) return false
    if (mode === 'others' && file.id === targetId) return false
    return true
  })
  .map((file) => file.id)

export const reorderTabsWithinGroup = (
  openFiles: OpenFile[],
  from: number,
  to: number,
): OpenFile[] => {
  const source = openFiles[from]
  const target = openFiles[to]
  if (!source || !target || (source.pinned === true) !== (target.pinned === true)) {
    return openFiles
  }
  return reorderTabs(openFiles, from, to)
}

export type DocumentTabNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'

/** 返回键盘导航后的标签；左右方向键会在首尾之间循环。 */
export const getTabNavigationTargetId = (
  openFiles: OpenFile[],
  fileId: string,
  key: DocumentTabNavigationKey,
): string | null => {
  const index = openFiles.findIndex((file) => file.id === fileId)
  if (index === -1 || openFiles.length === 0) return null
  if (key === 'Home') return openFiles[0].id
  if (key === 'End') return openFiles[openFiles.length - 1].id
  const offset = key === 'ArrowRight' ? 1 : -1
  return openFiles[(index + offset + openFiles.length) % openFiles.length].id
}

export const requiresCloseConfirmation = (
  savedMap: Record<string, boolean>,
  fileId: string,
): boolean => savedMap[fileId] === false

export const updateDocumentContent = (
  state: DocumentTabState,
  fileId: string,
  content: string,
): DocumentTabState => {
  const isSaved = !isDocumentDirty(content, state.savedContents[fileId] ?? '')
  return {
    ...state,
    openFiles: isSaved ? state.openFiles : pinPreviewOpenFile(state.openFiles, fileId),
    contents: { ...state.contents, [fileId]: content },
    savedMap: { ...state.savedMap, [fileId]: isSaved },
  }
}
