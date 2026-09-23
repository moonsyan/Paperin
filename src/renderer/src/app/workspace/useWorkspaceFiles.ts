import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { OpenFile, WorkspaceInfo } from '../../components/Sidebar'
import { getNeighborTabId } from '../../lib/document-tabs'
import { sameDesktopFilePath } from '../../lib/desktop-file-path'
import type { DocumentWorkspaceBridge } from './types'
import {
  flushActiveDocumentIf,
  mtimeOfFile,
  needsDocumentSave,
} from './workspace-file-pre-save'
import { runWorkspaceMoveFile } from './workspace-move-file'

/** Windows 大小写不敏感的路径相等判定（与 useDocumentSession/move 同口径）：
 *  删除/重命名按树路径寻址标签时避免大小写差异留下指向已删文件的幽灵标签 */
const sameFilePath = (a: string | undefined, b: string | undefined): boolean =>
  sameDesktopFilePath(a, b, window.desktopAPI?.platform === 'win32')

export interface UseWorkspaceFilesOptions {
  workspace: WorkspaceInfo | null
  /** 打开文件快照：移动文件夹前圈定受影响的脏文件（await 期间以 ref 为准） */
  openFiles: OpenFile[]
  savedMap: Record<string, boolean>
  fileMtime: Record<string, number>
  /** 会话能力窄桥接（App 以 useMemo 从 useDocumentSession 公共 API 组装） */
  bridge: DocumentWorkspaceBridge
  setToast: Dispatch<SetStateAction<string>>
  /** 改名/移动成功后同步来源基线路径 */
  onWorkspacePathRemapped?: (oldAbsolutePath: string, newAbsolutePath: string) => void
}

/**
 * 工作区文件操作：新建/重命名/删除/移动（含每类操作前置的"落账未保存内容 +
 * 冲突检测保存"与完整的状态迁移），以及目录刷新与新窗口打开。
 * 状态迁移经 DocumentWorkspaceBridge 访问会话记录，id 口径必须与
 * useDocumentSession 同步（file-路径 / untitled-N），任何一步改动都需
 * 同时验证编辑器同步、自动保存队列与草稿持久化。
 */
export function useWorkspaceFiles({
  workspace,
  openFiles,
  bridge,
  setToast,
  onWorkspacePathRemapped,
}: UseWorkspaceFilesOptions): {
  /** 文件操作返回是否真正完成（false = 冲突/失败已提示并中止），供控制器聚合结果 */
  handleCreateFile: (dirPath: string, name?: string) => Promise<boolean>
  handleRenameFile: (path: string, newName: string) => Promise<boolean>
  handleDeleteFile: (path: string) => Promise<boolean>
  handleMoveFile: (path: string, targetDir: string) => Promise<boolean>
  handleOpenInNewWindow: (path: string) => void
  refreshWorkspace: () => Promise<void>
} {
  const {
    openDocumentPath: handleSelectWorkspaceFile,
    openFolder: handleOpenFolder,
    liveContentOf,
    saveWithEncodingFallback,
    clearDraft,
    switchFile,
    flushEditorContent,
    leaveCurrentDocument,
    openFilesRef,
    contentsRef,
    activeFileIdRef,
    fileMtimeRef,
    initialOrSavedRef,
    draftPendingRef,
    setOpenFiles,
    setContents,
    setSavedMap,
    setFileMtime,
    setEncodingMap,
    setActiveFileId,
    setDocTitle,
  } = bridge
  /** 重新扫描工作区目录（增删改后刷新文件树）。
   *  刷新只是同步文件结构，不改变编辑上下文：preserveActiveTab=true
   *  禁止恢复路径按布局记录重放活动标签——否则新建/重命名提交后，
   *  用户可能被从正在编辑的标签拽回布局中记录的旧标签（首次打开
   *  工作区时的活动文档），再被后续流程切走，表现为编辑器来回跳转。 */
  const refreshWorkspace = useCallback(async () => {
    if (!workspace) return
    await handleOpenFolder(workspace.path, true, true)
  }, [workspace, handleOpenFolder])

  const handleCreateFile = useCallback(
    async (dirPath: string, name = '新文档.md'): Promise<boolean> => {
      if (!window.desktopAPI) return false
      const res = await window.desktopAPI.workspace.createFile(dirPath, name)
      if (!res.ok) {
        setToast(res.error?.code === 'EXISTS' ? '同名文件已存在' : '新建失败')
        return false
      }
      await refreshWorkspace()
      if (res.data) await handleSelectWorkspaceFile(res.data.path)
      return true
    },
    [refreshWorkspace, handleSelectWorkspaceFile, setToast],
  )

  const handleRenameFile = useCallback(
    async (path: string, newName: string): Promise<boolean> => {
      if (!newName.trim()) {
        setToast('文件名不能为空')
        return false
      }
      if (!window.desktopAPI) return false
      const currentRecord = openFilesRef.current.find((f) => sameFilePath(f.path, path))
      const currentId = currentRecord?.id ?? `file-${path}`
      if (
        !(await flushActiveDocumentIf(
          currentId,
          activeFileIdRef,
          leaveCurrentDocument,
          flushEditorContent,
        ))
      ) {
        return false
      }
      let pending: string | undefined
      if (
        needsDocumentSave(currentId, liveContentOf, initialOrSavedRef) &&
        contentsRef.current[currentId] !== undefined
      ) {
        pending = liveContentOf(currentId)
        const saveRes = await saveWithEncodingFallback(
          path,
          pending,
          mtimeOfFile(currentId, fileMtimeRef),
          currentId,
          true,
        )
        if (!saveRes.ok) {
          setToast(
            saveRes.error?.code === 'CONFLICT'
              ? `「${path.split(/[\\/]/).pop()}」已被外部修改，已中止重命名`
              : '重命名前保存失败，已中止',
          )
          return false
        }
        if (saveRes.data) {
          initialOrSavedRef.current[currentId] = pending
          setFileMtime((prev) => ({ ...prev, [currentId]: saveRes.data!.modifiedTime }))
        }
      }
      const res = await window.desktopAPI.workspace.renameFile(path, newName)
      if (!res.ok || !res.data) {
        if (res.error?.code === 'EXISTS') {
          setToast('同名文件已存在')
          return false
        }
        if (res.error?.code === 'INVALID_NAME') {
          setToast('文件名不能包含 \\ / : * ? " < > |')
          return false
        }
        setToast('重命名失败')
        return false
      }
      const newPath = res.data.path
      const finalName = res.data.name
      const newId = `file-${newPath}`
      const recordToMove = openFilesRef.current.find((f) => sameFilePath(f.path, path))
      if (!recordToMove) {
        void clearDraft(`file-${path}`)
        await refreshWorkspace()
        return true
      }
      const srcId = recordToMove.id
      const renamedFiles = openFilesRef.current.map((file) =>
        sameFilePath(file.path, path)
          ? { ...file, id: newId, name: finalName, path: newPath }
          : file,
      )
      openFilesRef.current = renamedFiles
      setOpenFiles(renamedFiles)
      setContents((prev) => {
        if (prev[srcId] === undefined) return prev
        const next = { ...prev }
        next[newId] = next[srcId]
        delete next[srcId]
        return next
      })
      if (contentsRef.current[srcId] !== undefined) {
        const nextRef = { ...contentsRef.current }
        nextRef[newId] = nextRef[srcId]
        delete nextRef[srcId]
        contentsRef.current = nextRef
      }
      initialOrSavedRef.current[newId] =
        pending !== undefined ? pending : (initialOrSavedRef.current[srcId] ?? '')
      delete initialOrSavedRef.current[srcId]
      setFileMtime((prev) => {
        const next = { ...prev }
        if (res.data && res.data.modifiedTime > 0) next[newId] = res.data.modifiedTime
        else if (prev[srcId] !== undefined) next[newId] = prev[srcId]
        delete next[srcId]
        return next
      })
      setEncodingMap((prev) => {
        if (prev[srcId] === undefined) return prev
        const next = { ...prev }
        next[newId] = next[srcId]
        delete next[srcId]
        return next
      })
      setSavedMap((prev) => {
        if (prev[srcId] === undefined && pending === undefined) return prev
        const next = { ...prev }
        next[newId] = pending !== undefined ? true : (prev[srcId] ?? true)
        delete next[srcId]
        return next
      })
      if (activeFileIdRef.current === srcId) {
        activeFileIdRef.current = newId
        setActiveFileId(newId)
        setDocTitle(finalName)
      }
      if (draftPendingRef.current?.id === srcId) draftPendingRef.current = null
      void clearDraft(srcId)
      onWorkspacePathRemapped?.(path, newPath)
      await refreshWorkspace()
      return true
    },
    [
      liveContentOf,
      saveWithEncodingFallback,
      refreshWorkspace,
      clearDraft,
      flushEditorContent,
      leaveCurrentDocument,
      setToast,
      openFilesRef,
      contentsRef,
      initialOrSavedRef,
      draftPendingRef,
      activeFileIdRef,
      fileMtimeRef,
      setOpenFiles,
      setContents,
      setSavedMap,
      setFileMtime,
      setEncodingMap,
      setActiveFileId,
      setDocTitle,
      onWorkspacePathRemapped,
    ],
  )

  const handleDeleteFile = useCallback(
    async (path: string): Promise<boolean> => {
      if (!window.desktopAPI) return false
      const delRecord = openFilesRef.current.find((f) => sameFilePath(f.path, path))
      const delId = delRecord?.id ?? `file-${path}`
      if (
        !(await flushActiveDocumentIf(
          delId,
          activeFileIdRef,
          leaveCurrentDocument,
          flushEditorContent,
        ))
      ) {
        return false
      }
      if (needsDocumentSave(delId, liveContentOf, initialOrSavedRef)) {
        const saveRes = await saveWithEncodingFallback(
          path,
          liveContentOf(delId),
          mtimeOfFile(delId, fileMtimeRef),
          delId,
          true,
        )
        if (!saveRes.ok) {
          setToast(
            saveRes.error?.code === 'CONFLICT'
              ? `「${path.split(/[\\/]/).pop()}」已被外部修改，已取消删除`
              : '删除前保存失败，已取消删除',
          )
          return false
        }
        if (saveRes.data) {
          initialOrSavedRef.current[delId] = contentsRef.current[delId] ?? ''
          setFileMtime((prev) => ({ ...prev, [delId]: saveRes.data!.modifiedTime }))
        }
      }
      const res = await window.desktopAPI.workspace.deleteFile(path)
      if (!res.ok) {
        setToast('删除失败')
        return false
      }
      const neighborId = getNeighborTabId(openFilesRef.current, delId)
      openFilesRef.current = openFilesRef.current.filter((file) => file.id !== delId)
      setOpenFiles((prev) => prev.filter((f) => f.id !== delId))
      setContents((prev) => {
        const next = { ...prev }
        delete next[delId]
        return next
      })
      setSavedMap((prev) => {
        const next = { ...prev }
        delete next[delId]
        return next
      })
      setFileMtime((prev) => {
        const next = { ...prev }
        delete next[delId]
        return next
      })
      setEncodingMap((prev) => {
        const next = { ...prev }
        delete next[delId]
        return next
      })
      if (draftPendingRef.current?.id === delId) draftPendingRef.current = null
      void clearDraft(delId)
      delete initialOrSavedRef.current[delId]
      await refreshWorkspace()
      if (activeFileIdRef.current === delId) {
        const target =
          neighborId && openFilesRef.current.some((f) => f.id === neighborId)
            ? neighborId
            : openFilesRef.current[0]?.id
        if (target) await switchFile(target)
      }
      return true
    },
    [
      refreshWorkspace,
      switchFile,
      clearDraft,
      liveContentOf,
      saveWithEncodingFallback,
      flushEditorContent,
      leaveCurrentDocument,
      setToast,
      openFilesRef,
      contentsRef,
      initialOrSavedRef,
      draftPendingRef,
      activeFileIdRef,
      fileMtimeRef,
      setOpenFiles,
      setContents,
      setSavedMap,
      setFileMtime,
      setEncodingMap,
    ],
  )

  const handleMoveFile = useCallback(
    async (path: string, targetDir: string): Promise<boolean> =>
      runWorkspaceMoveFile(path, targetDir, {
        openFiles,
        bridge,
        setToast,
        refreshWorkspace,
        onWorkspacePathRemapped,
      }),
    [openFiles, bridge, setToast, refreshWorkspace, onWorkspacePathRemapped],
  )

  /** 右键在新窗口打开文件（U7） */
  const handleOpenInNewWindow = useCallback((path: string) => {
    void window.desktopAPI?.window.newWindowWithFile(path)
  }, [])

  return {
    handleCreateFile,
    handleRenameFile,
    handleDeleteFile,
    handleMoveFile,
    handleOpenInNewWindow,
    refreshWorkspace,
  }
}
