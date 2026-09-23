import { useCallback, useEffect, useRef, useState } from 'react'
import type { DraftBackupActivity } from '../../lib/document-save-status'
import { createLatestRequestGuard } from '../../../../shared/latest-request'
import { toStoredImages } from '../../lib/image-path'
import { pinPreviewOpenFile } from '../../lib/document-tabs'
import { shouldRestoreEditorFocus } from '../../lib/editor-focus'
import { useDraftPersistence } from '../../hooks/useDraftPersistence'
import type { DocumentSessionOptions } from './types'
import { FRESH_MODE } from '../constants'
import { useEditorDocumentSync } from './useEditorDocumentSync'
import { useDocumentState } from './useDocumentState'
import { useDocumentSaveQueue } from './useDocumentSaveQueue'
import { useDocumentSaving } from './useDocumentSaving'
import { useDocumentTabs } from './useDocumentTabs'
import { useWorkspaceFolderOpen } from './useWorkspaceFolderOpen'
import { useDocumentRestore } from './useDocumentRestore'
import { shouldPreferCachedDocumentSnapshot } from './large-document-save'

/**
 * 文档会话域门面：多标签状态（openFiles/contents/savedMap/mtime/编码）、
 * 编辑器内容同步、自动保存队列、草稿持久化与文件打开/保存/关闭操作。
 * 状态由本模块持有，App 只消费返回值。
 *
 * 内部按职责边界组合（依赖自上而下，不可调换顺序）：
 * - useDocumentState        会话状态与 ref 镜像
 * - useDocumentSaveQueue    自动保存队列、GBK 编码降级、版本快照
 * - useEditorDocumentSync   编辑器内容替换与同步回调（依赖队列）
 * - useDocumentSaving       手动保存/另存为/关闭前保存（依赖队列与同步）
 * - useDocumentTabs         标签生命周期与关窗保存编排（依赖上述全部）
 * - useWorkspaceFolderOpen  打开工作区文件夹与布局恢复
 * - useDocumentRestore      启动时会话/草稿恢复
 */
export function useDocumentSession({
  editorRef,
  titleRef,
  settingsReady,
  autosave,
  setToast,
  recordRecent,
  workspacePathRef,
  workspaceDocumentsRef,
  setWorkspace,
  setWorkspaceStateReady,
  setWorkspaceSettings,
  setWorkspaceDocuments,
  setWorkspaceCollapsedKeys,
  setSidebarWidth,
  setSidebarActiveTab,
  setContextDockState,
  setSearchCount,
  setSearchCurrent,
  setSearchMode,
  restoringWorkspaceRef,
  draftSessionIdRef,
  onDocumentPathCommitted,
}: DocumentSessionOptions) {
  const documentState = useDocumentState()
  const {
    activeContent,
    activeFileId,
    activeFileIdRef,
    contentsRef,
    initialOrSavedRef,
    openFiles,
    openFilesRef,
    setOpenFiles,
  } = documentState

  /** 同一路径的文件树单击/双击只共享一次读取请求，避免慢磁盘下出现重复标签。 */
  const openingWorkspaceFilesRef = useRef(new Map<string, Promise<boolean>>())
  /** 最后一次文件选择意图；较早的慢读取完成后不得反向抢占当前文件。 */
  const latestWorkspaceSelectionRef = useRef('')
  // 惰性初始化：避免每帧重建守卫闭包（仅首帧创建）
  const workspaceOpenGuardRef = useRef<ReturnType<typeof createLatestRequestGuard> | null>(null)
  if (!workspaceOpenGuardRef.current) workspaceOpenGuardRef.current = createLatestRequestGuard()

  /** 求某文件所在目录（图片相对路径解析用），未命中回退工作区目录 */
  const dirOfFile = useCallback((fileId: string): string | undefined => {
    const f = openFilesRef.current.find((x) => x.id === fileId)
    if (f?.path) return f.path.replace(/[\\/][^\\/]+$/, '')
    return workspacePathRef.current
  }, [openFilesRef, workspacePathRef])

  /** 读指定文档的内容：活动文件直接读编辑器实时内容（防抖窗口内 state 滞后），
   *  非活动文件读 ref 镜像（切换时已 flush，不会滞后）。
   *  定义在 useDraftPersistence 之前（E4：冲刷草稿时需读取实时内容）。 */
  const liveContentOf = useCallback(
    (id: string): string => {
      if (id === activeFileIdRef.current && editorRef.current?.isReady()) {
        const cachedContent = contentsRef.current[id] ?? ''
        if (shouldPreferCachedDocumentSnapshot(cachedContent)) return cachedContent
        const md = editorRef.current.getMarkdown()
        if (md !== null) return toStoredImages(md, dirOfFile(id))
      }
      return contentsRef.current[id] ?? ''
    },
    [activeFileIdRef, contentsRef, dirOfFile, editorRef],
  )

  const [draftBackupActivity, setDraftBackupActivity] = useState<DraftBackupActivity>('idle')
  const draftFailureNotifiedRef = useRef(false)

  const handleDraftPersist = useCallback(
    (outcome: 'success' | 'failure', error?: unknown) => {
      if (outcome === 'success') {
        draftFailureNotifiedRef.current = false
        setDraftBackupActivity('backed-up')
        return
      }
      setDraftBackupActivity('failed')
      if (draftFailureNotifiedRef.current) return
      draftFailureNotifiedRef.current = true
      const code = error instanceof Error ? error.message : ''
      if (code === 'DRAFT_SESSION_CONFLICT') {
        setToast(
          '该文件的草稿备份已由其他窗口占用；本窗口编辑仍保留，请在此窗口保存到磁盘',
        )
      } else {
        setToast('草稿未能备份到磁盘，编辑内容仍保留在本窗口；请检查磁盘空间或稍后重试')
      }
    },
    [setToast],
  )

  const { clearDraft, draftPendingRef, saveDraft } = useDraftPersistence({
    activeFileId,
    content: activeContent,
    ready: settingsReady && Boolean(draftSessionIdRef?.current),
    // E4：切换标签冲刷草稿时读编辑器实时内容，避免 200ms 防抖窗口内内容滞后
    getLiveContent: liveContentOf,
    getBaseline: (id) => initialOrSavedRef.current[id],
    draftSessionId: draftSessionIdRef?.current,
    // fresh 窗口禁用草稿：草稿经 settings-store 与主窗口共享，
    // fresh 窗口写/删会覆盖或误删主窗口同一文件的未保存内容
    enabled: !FRESH_MODE,
    onDraftPersist: handleDraftPersist,
  })

  // 新输入或切换文档后，上一轮的「草稿已备份」不再代表当前版本
  useEffect(() => {
    setDraftBackupActivity('idle')
  }, [activeContent, activeFileId])

  /* ==================== 自动保存队列 ==================== */

  const saveQueueApi = useDocumentSaveQueue({
    autosave,
    state: documentState,
    setToast,
    clearDraft,
  })

  /* ==================== 编辑内容同步 ==================== */

  /** 将预览标签升级为固定标签，并同步 React 状态与供同步回调读取的镜像。
   *  编辑器同步回调需要它，故先于 sync/tabs 创建。 */
  const pinPreviewTab = useCallback((fileId: string) => {
    const previewFile = openFilesRef.current.find((file) => file.id === fileId)
    if (!previewFile?.preview) return
    openFilesRef.current = pinPreviewOpenFile(openFilesRef.current, fileId)
    setOpenFiles((prev) => pinPreviewOpenFile(prev, fileId))
  }, [openFilesRef, setOpenFiles])

  const {
    handleEditorChange,
    replaceEditorContent,
    flushEditorContent,
  } = useEditorDocumentSync({
    state: documentState,
    editorRef,
    dirOfFile,
    cancelAutoSave: saveQueueApi.cancelAutoSave,
    scheduleAutoSave: saveQueueApi.scheduleAutoSave,
    pinPreviewTab,
    setToast,
    setSearchCount,
    setSearchCurrent,
    setSearchMode,
  })

  /* ==================== 手动保存流程 ==================== */

  const { handleSave, handleSaveAs, saveBeforeClose, saveActivity } = useDocumentSaving({
    state: documentState,
    editorRef,
    saveQueueApi,
    dirOfFile,
    liveContentOf,
    replaceEditorContent,
    recordRecent,
    setToast,
    clearDraft,
    saveDraft,
    draftPendingRef,
    onDocumentPathCommitted,
  })

  /* ==================== 标签生命周期 ==================== */

  /**
   * 延迟聚焦编辑器（U6）：新建/打开文件后等内容替换与渲染完成再聚焦，
   * 确保用户可直接开始输入，无需手动点击编辑区
   */
  const focusEditorSoon = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        // 用户已在关闭面板后转去其他输入控件时，不再抢回焦点。
        if (!shouldRestoreEditorFocus(document.activeElement, document.body)) return
        editorRef.current?.focus()
      }, 60)
    })
  }, [editorRef])

  const tabs = useDocumentTabs({
    state: documentState,
    editorRef,
    titleRef,
    flushEditorContent,
    replaceEditorContent,
    pinPreviewTab,
    dirOfFile,
    saveBeforeClose,
    saveQueueRef: saveQueueApi.saveQueueRef,
    clearDraft,
    draftPendingRef,
    focusEditorSoon,
    recordRecent,
    setToast,
    workspacePathRef,
    workspaceDocumentsRef,
    setWorkspaceDocuments,
    latestWorkspaceSelectionRef,
    openingWorkspaceFilesRef,
  })

  /* ==================== 打开文件夹 / 工作区 ==================== */

  const { handleOpenFolder } = useWorkspaceFolderOpen({
    state: documentState,
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
    captureWorkspaceDocumentView: tabs.captureWorkspaceDocumentView,
    restoreWorkspaceDocumentView: tabs.restoreWorkspaceDocumentView,
    switchFile: tabs.switchFile,
    handleNew: tabs.handleNew,
    replaceEditorContent,
  })

  /* ==================== 会话恢复（启动初始化调用） ==================== */

  // restore 打开工作区走 preserveActiveTab 分支；据此置闸门 ref，让
  // useGraphView 的 auto-open 只出现标签不激活（避免图谱盖住恢复的文档）。
  // 用户手动打开文件夹不经过此包装，保持"打开即激活图谱"的既有设计
  const handleOpenFolderForRestore = useCallback(
    (path?: string, silent?: boolean, preserveActiveTab?: boolean) => {
      if (preserveActiveTab && restoringWorkspaceRef) restoringWorkspaceRef.current = false
      return handleOpenFolder(path, silent, preserveActiveTab)
    },
    [handleOpenFolder, restoringWorkspaceRef],
  )

  const { restoreFromSessionData } = useDocumentRestore({
    state: documentState,
    editorRef,
    setToast,
    handleOpenFolder: handleOpenFolderForRestore,
    handleSelectWorkspaceFile: tabs.handleSelectWorkspaceFile,
    replaceEditorContent,
  })

  /* ==================== 统一文档会话接口（Task 7） ==================== */

  /** 打开文档：带路径时走工作区文件打开（含请求守卫），缺省时弹出打开对话框 */
  const openDocument = useCallback(
    async (path?: string): Promise<boolean> => {
      if (path) return tabs.handleSelectWorkspaceFile(path)
      await tabs.handleOpen()
      return true
    },
    [tabs],
  )

  /**
   * 统一动作入口：内部全部委托既有实现，行为与旧入口一致。
   * - updateDocument 走编辑器内容替换通道（mode 缺省 update），ProseMirror
   *   仍是编辑器真实状态；
   * - 文档记录视图见 documents / activeDocument（Task 4 DocumentRecord）。
   */
  const documentSessionApi = {
    documents: documentState.documents,
    activeDocument: documentState.activeDocument,
    openDocument,
    updateDocument: replaceEditorContent,
    saveDocument: handleSave,
    closeDocument: tabs.handleCloseTab,
    switchDocument: tabs.switchFile,
  }

  return {
    ...documentSessionApi,
    // 会话状态
    openFiles,
    contents: documentState.contents,
    savedMap: documentState.savedMap,
    activeFileId,
    docTitle: documentState.docTitle,
    fileMtime: documentState.fileMtime,
    fileMtimeRef: documentState.fileMtimeRef,
    contentHashMap: documentState.contentHashMap,
    contentHashRef: documentState.contentHashRef,
    encodingMap: documentState.encodingMap,
    activeFile: documentState.activeFile,
    activeContent,
    saved: documentState.saved,
    saveActivity,
    draftBackupActivity,
    // 会话状态 setter（供工作区文件操作等相邻域就地迁移记录）
    setOpenFiles: documentState.setOpenFiles,
    setContents: documentState.setContents,
    setSavedMap: documentState.setSavedMap,
    setFileMtime: documentState.setFileMtime,
    setContentHashMap: documentState.setContentHashMap,
    setEncodingMap: documentState.setEncodingMap,
    setActiveFileId: documentState.setActiveFileId,
    setDocTitle: documentState.setDocTitle,
    // 会话镜像与内部结构（供工作区文件操作等相邻域使用）
    openFilesRef,
    contentsRef: documentState.contentsRef,
    activeFileIdRef,
    INITIAL_OR_SAVED: documentState.initialOrSavedRef,
    saveQueueRef: saveQueueApi.saveQueueRef,
    // 编辑器同步
    handleEditorChange,
    replaceEditorContent,
    flushEditorContent,
    leaveCurrentDocument: tabs.leaveCurrentDocument,
    liveContentOf,
    dirOfFile,
    // 文件操作
    switchFile: tabs.switchFile,
    handleNew: tabs.handleNew,
    handleSelectDemoFile: tabs.handleSelectDemoFile,
    handleOpen: tabs.handleOpen,
    handleOpenFolder,
    handleSelectWorkspaceFile: tabs.handleSelectWorkspaceFile,
    handleSave,
    handleSaveAs,
    handleCloseTab: tabs.handleCloseTab,
    handleCloseOtherTabs: tabs.handleCloseOtherTabs,
    handleCloseAllTabs: tabs.handleCloseAllTabs,
    handleTogglePinnedTab: tabs.handleTogglePinnedTab,
    handleReorderTabs: tabs.handleReorderTabs,
    saveWithEncodingFallback: saveQueueApi.saveWithEncodingFallback,
    clearDraft,
    draftPendingRef,
    focusEditorSoon,
    // 启动恢复
    restoreFromSessionData,
  }
}
