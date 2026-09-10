import type { OpenFile } from '../../components/Sidebar'

export interface TabRemovalPlan {
  nextOpenFiles: OpenFile[]
  nextActiveFileId: string
  activeTabWasClosed: boolean
}

/**
 * 描述标签移除后的唯一活动文档选择规则。副作用（草稿、自动保存、编辑器）
 * 由 useDocumentTabClosing 在应用此计划时执行，保证规则可以脱离 React 直接测试。
 */
export const planTabRemoval = (
  openFiles: OpenFile[],
  activeFileId: string,
  ids: string[],
  fallbackFileId: string,
): TabRemovalPlan => {
  const targets = new Set(ids)
  const nextOpenFiles = openFiles.filter((file) => !targets.has(file.id))
  const activeTabWasClosed = targets.has(activeFileId)

  return {
    nextOpenFiles,
    nextActiveFileId: activeTabWasClosed
      ? (nextOpenFiles[0]?.id ?? fallbackFileId)
      : activeFileId,
    activeTabWasClosed,
  }
}
