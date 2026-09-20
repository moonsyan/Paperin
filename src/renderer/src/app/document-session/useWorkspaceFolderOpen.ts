import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import {
  DEFAULT_WORKSPACE_SETTINGS,
  type ContextDockState,
  type SidebarView,
  type WorkspaceDocumentsState,
  type WorkspaceSettingsState,
} from '../../../../shared/workspace-state'
import { createLatestRequestGuard } from '../../../../shared/latest-request'
import type { OpenFile, WorkspaceInfo } from '../../components/Sidebar'
import { resolveWorkspacePath, toWorkspaceRelativePath } from '../../lib/workspace-state'
import type { DocumentState } from './useDocumentState'
import { sameFilePath } from './filePath'

export interface UseWorkspaceFolderOpenOptions {
  state: DocumentState
  workspacePathRef: MutableRefObject<string | undefined>
  workspaceDocumentsRef: MutableRefObject<WorkspaceDocumentsState>
  workspaceOpenGuardRef: MutableRefObject<ReturnType<typeof createLatestRequestGuard> | null>
  setWorkspace: (next: WorkspaceInfo | null) => void
  setWorkspaceStateReady: (ready: boolean) => void
  setWorkspaceSettings: (next: WorkspaceSettingsState) => void
  setWorkspaceDocuments: (next: WorkspaceDocumentsState) => void
  setWorkspaceCollapsedKeys: (keys: string[]) => void
  setSidebarWidth: (width: number) => void
  setSidebarActiveTab: (view: SidebarView) => void
  setContextDockState: (state: ContextDockState) => void
  setToast: (message: string) => void
  captureWorkspaceDocumentView: (fileId: string) => void
  restoreWorkspaceDocumentView: (fileId: string, tries?: number) => void
  switchFile: (id: string) => void | Promise<void>
  handleNew: () => void | Promise<void>
  replaceEditorContent: (
    fileId: string,
    content: string,
    mode?: 'initialize' | 'update' | 'ignore',
  ) => void
}

/** 打开工作区文件夹（含会话恢复路径）：保存旧工作区文档视图、读取新树、
 *  恢复布局快照中的标签（复用已打开标签的内存内容）并恢复活动文档。
 *  从 useDocumentSession 原样迁移。 */
export function useWorkspaceFolderOpen({
  state,
  workspacePathRef,
  workspaceDocumentsRef,
  workspaceOpenGuardRef,
  setWorkspace,
  setWorkspaceStateReady,
  setWorkspaceSettings,
  setWorkspaceDocuments,
  setWorkspaceCollapsedKeys,
  setSidebarWidth,
  setSidebarActiveTab,
  setContextDockState,
  setToast,
  captureWorkspaceDocumentView,
  restoreWorkspaceDocumentView,
  switchFile,
  handleNew,
  replaceEditorContent,
}: UseWorkspaceFolderOpenOptions) {
  const {
    activeFileIdRef,
    contentsRef,
    initialOrSavedRef: INITIAL_OR_SAVED,
    openFilesRef,
    setActiveFileId,
    setContents,
    setDocTitle,
    setEncodingMap,
    setFileMtime,
    setContentHashMap,
    setOpenFiles,
    setSavedMap,
  } = state

  const handleOpenFolder = useCallback(
    async (path?: string, silent = false, preserveActiveTab = false) => {
      if (!window.desktopAPI) return
      const isCurrentRequest = workspaceOpenGuardRef.current!.begin()
      let previousWorkspaceSave: Promise<unknown> | null = null
      if (workspacePathRef.current) {
        captureWorkspaceDocumentView(activeFileIdRef.current)
        previousWorkspaceSave = window.desktopAPI.workspaceState.saveDocuments(
          workspaceDocumentsRef.current,
        )
      }
      try {
        const openFolderRequest = window.desktopAPI.document.openFolder(path)
        const [result] = await Promise.all([
          openFolderRequest,
          previousWorkspaceSave ?? Promise.resolve(),
        ])
        if (!isCurrentRequest()) return
        if (!result.ok || !result.data) {
          const currentWorkspacePath = workspacePathRef.current
          if (currentWorkspacePath) {
            await window.desktopAPI.document.openFolder(currentWorkspacePath)
            if (!isCurrentRequest()) return
          }
          setWorkspaceStateReady(true)
          if (path) setToast('工作区文件夹无法访问，已跳过恢复')
          return
        }
        const { path: folderPath, name, tree } = result.data
        setWorkspaceStateReady(false)
        const stateResult = await window.desktopAPI.workspaceState.load()
        if (!isCurrentRequest()) return
        let restoredActiveFile: OpenFile | undefined
        let restoredActiveContent = ''
        /** 本次恢复中"复用已打开标签"（而非从磁盘重读）的 id 集合 */
        const reusedTabIds = new Set<string>()
        if (stateResult.ok && stateResult.data) {
          const bundle = stateResult.data
          // 已在当前会话打开的文件：刷新工作区（新建/重命名/移动/删除后重扫）
          // 时保留内存中的内容与保存状态——自动保存防抖窗口内的输入、或用户
          // 关闭自动保存后的未保存编辑，不能被磁盘重读内容静默覆盖
          const findOpenByPath = (target: string): OpenFile | undefined => {
            for (const file of openFilesRef.current) {
              if (sameFilePath(file.path, target)) return file
            }
            return undefined
          }
          const restoredFiles: OpenFile[] = []
          const restoredContents: Record<string, string> = {}
          const restoredMtimes: Record<string, number> = {}
          const restoredHashes: Record<string, string> = {}
          const restoredEncodings: Record<string, string> = {}
          let skippedFiles = 0
          const orderedTabs = [
            ...bundle.layout.tabs.filter((tab) => tab.pinned),
            ...bundle.layout.tabs.filter((tab) => !tab.pinned),
          ]
          for (const tab of orderedTabs) {
            const absolutePath = resolveWorkspacePath(folderPath, tab.path, window.desktopAPI.platform)
            if (!absolutePath) {
              skippedFiles++
              continue
            }
            const existing = findOpenByPath(absolutePath)
            if (existing) {
              // 复用已打开标签：保留其 id 与内存内容，仅同步固定状态
              reusedTabIds.add(existing.id)
              restoredFiles.push(
                existing.pinned === tab.pinned ? existing : { ...existing, pinned: tab.pinned },
              )
              continue
            }
            const fileResult = await window.desktopAPI.document.read(absolutePath)
            if (!isCurrentRequest()) return
            if (!fileResult.ok || !fileResult.data) {
              skippedFiles++
              continue
            }
            const id = `file-${absolutePath}`
            restoredFiles.push({
              id,
              name: fileResult.data.name,
              path: absolutePath,
              pinned: tab.pinned,
            })
            restoredContents[id] = fileResult.data.content
            restoredMtimes[id] = fileResult.data.modifiedTime
            if (fileResult.data.contentSha256) restoredHashes[id] = fileResult.data.contentSha256
            if (fileResult.data.encoding) restoredEncodings[id] = fileResult.data.encoding
          }

          setWorkspaceSettings(bundle.settings)
          workspaceDocumentsRef.current = bundle.documents
          setWorkspaceDocuments(bundle.documents)
          setSidebarWidth(bundle.layout.sidebar.width)
          setSidebarActiveTab('files')
          if (bundle.layout.contextDock) {
            setContextDockState(bundle.layout.contextDock)
          }
          setWorkspaceCollapsedKeys(
            bundle.layout.sidebar.collapsedDirectories.flatMap((relativePath) => {
              const absolutePath = resolveWorkspacePath(
                folderPath,
                relativePath,
                window.desktopAPI.platform,
              )
              return absolutePath ? [absolutePath] : []
            }),
          )
          const existingOutsideWorkspace = openFilesRef.current.filter((file) => {
            if (!file.path) return true
            return toWorkspaceRelativePath(
              folderPath,
              file.path,
              window.desktopAPI.platform === 'win32',
            ) === null
          })
          // 布局快照保存有 500ms 防抖：刚打开/重排的工作区标签可能尚未写入布局，
          // 刷新时不能因此被丢弃——追加布局未覆盖的已打开工作区标签
          const coveredByLayout = restoredFiles.map((file) => file.path ?? '')
          const uncoveredWorkspaceTabs = openFilesRef.current.filter((file) => {
            if (!file.path) return false
            if (toWorkspaceRelativePath(
              folderPath,
              file.path,
              window.desktopAPI.platform === 'win32',
            ) === null) return false
            return !coveredByLayout.some((covered) => sameFilePath(covered, file.path!))
          })
          const nextOpenFiles = [
            ...restoredFiles,
            ...uncoveredWorkspaceTabs,
            ...existingOutsideWorkspace,
          ]
          // 基线/内容/保存状态只对"本次新恢复"的标签落盘值生效；
          // 复用标签维持内存态（含未保存编辑与脏标记）
          Object.assign(INITIAL_OR_SAVED.current, restoredContents)
          openFilesRef.current = nextOpenFiles
          setOpenFiles(nextOpenFiles)
          contentsRef.current = { ...contentsRef.current, ...restoredContents }
          setContents((prev) => ({ ...prev, ...restoredContents }))
          setSavedMap((prev) => ({
            ...prev,
            ...Object.fromEntries(
              restoredFiles
                .filter((file) => !reusedTabIds.has(file.id))
                .map((file) => [file.id, true]),
            ),
          }))
          setFileMtime((prev) => ({ ...prev, ...restoredMtimes }))
          if (Object.keys(restoredHashes).length) {
            setContentHashMap((prev) => ({ ...prev, ...restoredHashes }))
          }
          setEncodingMap((prev) => ({ ...prev, ...restoredEncodings }))

          const activePath = bundle.layout.activeTab
            ? resolveWorkspacePath(folderPath, bundle.layout.activeTab, window.desktopAPI.platform)
            : null
          restoredActiveFile = activePath
            ? restoredFiles.find((file) => sameFilePath(file.path, activePath))
            : restoredFiles[0]
          restoredActiveContent = restoredActiveFile
            ? (contentsRef.current[restoredActiveFile.id] ?? restoredContents[restoredActiveFile.id] ?? '')
            : ''
          if (skippedFiles > 0) setToast(`已跳过 ${skippedFiles} 个无法恢复的标签页`)
        } else {
          const emptyDocuments: WorkspaceDocumentsState = { schemaVersion: 1, documents: {} }
          setWorkspaceSettings(DEFAULT_WORKSPACE_SETTINGS)
          workspaceDocumentsRef.current = emptyDocuments
          setWorkspaceDocuments(emptyDocuments)
          setWorkspaceCollapsedKeys([])
        }
        workspacePathRef.current = folderPath
        setWorkspace({ path: folderPath, name, tree })
        setWorkspaceStateReady(true)
        // preserveActiveTab：会话恢复路径的活动文档由 restoreFromSessionData
        // 统一决定（含未命名/工作区外文件的回退链）；这里不等待地异步完成，
        // 若再写 activeFileId 会与本轮会话恢复的设置竞态、覆盖成工作区首标签
        if (restoredActiveFile && !preserveActiveTab) {
          if (reusedTabIds.has(restoredActiveFile.id)) {
            // 恢复的活动标签在本次会话已打开：直接切换（保留其未保存编辑
            // 与脏标记；恰为当前活动标签时 switchFile 自行短路，编辑器不动）
            switchFile(restoredActiveFile.id)
          } else {
            activeFileIdRef.current = restoredActiveFile.id
            setActiveFileId(restoredActiveFile.id)
            setDocTitle(restoredActiveFile.name)
            replaceEditorContent(restoredActiveFile.id, restoredActiveContent, 'initialize')
            restoreWorkspaceDocumentView(restoredActiveFile.id)
          }
        }
        // 空文件夹：自动创建一篇空白文档供书写（会话静默恢复时不创建）
        if (tree.length === 0 && !silent) {
          handleNew()
        }
      } catch (error) {
        // 任一 IPC（saveDocuments / openFolder）或文件读取失败：恢复就绪态，
        // 避免 UI 卡在加载中。仅当前请求负责兜底，被新请求取代（isCurrentRequest 为
        // 假）时交由其处理，避免两条请求互相覆盖工作区状态。
        console.error('[workspace] 打开文件夹失败', error)
        if (isCurrentRequest()) {
          setWorkspaceStateReady(true)
          if (path) setToast('工作区文件夹无法访问，已跳过恢复')
        }
      }
    },
    [
      INITIAL_OR_SAVED,
      activeFileIdRef,
      captureWorkspaceDocumentView,
      contentsRef,
      handleNew,
      openFilesRef,
      replaceEditorContent,
      restoreWorkspaceDocumentView,
      setActiveFileId,
      setContents,
      setDocTitle,
      setEncodingMap,
      setFileMtime,
      setContentHashMap,
      setOpenFiles,
      setSavedMap,
      setSidebarActiveTab,
      setSidebarWidth,
      setToast,
      setWorkspace,
      setWorkspaceCollapsedKeys,
      setWorkspaceDocuments,
      setWorkspaceSettings,
      setWorkspaceStateReady,
      switchFile,
      setContextDockState,
      workspaceDocumentsRef,
      workspaceOpenGuardRef,
      workspacePathRef,
    ],
  )

  return { handleOpenFolder }
}
