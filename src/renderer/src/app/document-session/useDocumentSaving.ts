import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { toStoredImages } from '../../lib/image-path'
import { useDocumentCloseSaving } from './useDocumentCloseSaving'
import type { PendingDraft } from '../../hooks/useDraftPersistence'
import { nextUntitled } from '../constants'
import type { DocumentState } from './useDocumentState'
import type { DocumentSaveQueueApi } from './useDocumentSaveQueue'
import type { EditorHandle } from '../../components/Editor'
import { shouldPreferCachedDocumentSnapshot } from './large-document-save'
import { ensureFreshSnapshot } from './ensure-snapshot'
import { resolveSaveReceipt } from './save-receipt'
import type { DocumentSaveActivity } from '../../lib/document-save-status'

export interface UseDocumentSavingOptions {
  state: DocumentState
  editorRef: RefObject<EditorHandle>
  saveQueueApi: DocumentSaveQueueApi
  dirOfFile: (fileId: string) => string | undefined
  liveContentOf: (id: string) => string
  replaceEditorContent: (
    fileId: string,
    content: string,
    mode?: 'initialize' | 'update' | 'ignore',
  ) => void
  recordRecent: (path: string, name: string) => void
  setToast: (message: string) => void
  clearDraft: (fileId: string) => Promise<void>
  saveDraft: (fileId: string, content: string) => Promise<void>
  draftPendingRef: MutableRefObject<PendingDraft | null>
  /** 快照落账等待上限（T05）；仅测试注入以缩短等待，生产用默认 5s */
  snapshotSettleTimeoutMs?: number
  /** 另存为/首次保存成功后通知来源身份迁移（previous → 新绝对路径）。 */
  onDocumentPathCommitted?: (info: {
    previousDocumentId: string
    previousPath: string | undefined
    nextPath: string
  }) => void
}

export interface DocumentSavingApi {
  handleSave: () => Promise<void>
  handleSaveAs: () => Promise<void>
  saveBeforeClose: (id: string) => Promise<boolean>
  saveActivity: DocumentSaveActivity
}

/** 手动保存流程：保存 / 另存为 / 关闭前保存与未保存状态上报。
 *  从 useDocumentSession 原样迁移；依赖自动保存队列 hook 与编辑器同步。 */
export function useDocumentSaving({
  state,
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
  snapshotSettleTimeoutMs,
  onDocumentPathCommitted,
}: UseDocumentSavingOptions): DocumentSavingApi {
  const {
    activeFileId,
    activeFileIdRef,
    activeSessionRef,
    contents,
    contentsRef,
    contentHashRef,
    fileMtime,
    fileMtimeRef,
    initialOrSavedRef: INITIAL_OR_SAVED,
    openFiles,
    openFilesRef,
    savedMap,
    setActiveFileId,
    setContents,
    setContentHashMap,
    setDocTitle,
    setEncodingMap,
    setFileMtime,
    setOpenFiles,
    setSavedMap,
  } = state
  const {
    saveWithEncodingFallback,
    recordHistory,
    resolveSelfConflict,
    cancelAutoSave,
  } = saveQueueApi
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const saveEpoch = useRef(0)
  const [saveNotice, setSaveNotice] = useState<{ fileId: string; activity: DocumentSaveActivity } | null>(null)
  const saveActivity: DocumentSaveActivity = saveNotice?.fileId === activeFileId ? saveNotice.activity : 'idle'
  const beginSave = useCallback((fileId: string): number => {
    const epoch = ++saveEpoch.current
    setSaveNotice({ fileId, activity: 'saving' })
    return epoch
  }, [])
  const finishSave = useCallback((fileId: string, epoch: number, activity: DocumentSaveActivity) => {
    if (saveEpoch.current !== epoch) return
    setSaveNotice(activity === 'idle' || activity === 'saving' ? null : { fileId, activity })
  }, [])

  const handleSaveAs = useCallback(async () => {
    if (!window.desktopAPI) return
    const oldId = activeFileId
    const epoch = beginSave(oldId)
    const targetSession = activeSessionRef.current
    const targetEditor = editorRef.current
    const targetPath = openFilesRef.current.find((file) => file.id === oldId)?.path
    const isTargetCurrent = () => mounted.current
      && activeFileIdRef.current === oldId
      && activeSessionRef.current === targetSession
      && editorRef.current === targetEditor
      && openFilesRef.current.some((file) => file.id === oldId && file.path === targetPath)
    const cachedContent = contentsRef.current[oldId] ?? contents[oldId] ?? ''
    let content: string
    if (shouldPreferCachedDocumentSnapshot(cachedContent)) {
      const outcome = await ensureFreshSnapshot({
        hasPendingChanges: () => editorRef.current?.hasPendingChanges() ?? false,
        readSnapshot: () => contentsRef.current[oldId] ?? contents[oldId] ?? '',
        isTargetCurrent,
      }, snapshotSettleTimeoutMs)
      if (!outcome.settled) {
        finishSave(oldId, epoch, 'idle')
        if (mounted.current) {
          setToast(
            outcome.reason === 'target-changed'
              ? '文档已切换，未另存可能过期的快照；请返回原文档后重试'
              : '文档仍在生成快照，未另存旧版本；请稍后再次保存',
          )
        }
        return
      }
      content = outcome.content
    } else {
      const editorMd = editorRef.current?.isReady() ? editorRef.current.getMarkdown() : null
      content = editorMd != null
        ? toStoredImages(editorMd, dirOfFile(oldId))
        : cachedContent
    }
    const result = await window.desktopAPI.document.saveAs(content)
    if (!isTargetCurrent()) {
      finishSave(oldId, epoch, 'idle')
      if (mounted.current && result.ok && result.data) {
        setToast('另存为已完成，但文档已切换，未替换当前标签')
      }
      return
    }
    if (!result.ok || !result.data) {
      finishSave(oldId, epoch, result.error?.code === 'CANCELLED' ? 'idle' : 'failed')
      if (result.error?.code !== 'CANCELLED') {
        setToast('另存为失败，请检查目标文件权限或磁盘空间')
      }
      return
    }
    const { path, name } = result.data
    // 另存为创建了新文件，纳入最近文件列表（与原打开逻辑一致）
    recordRecent(path, name)
    recordHistory(path)
    const newId = `file-${path}`
    const targetFile =
      newId !== oldId
        ? openFilesRef.current.find((file) => file.id === newId)
        : undefined
    const targetAlreadyOpen = Boolean(targetFile)
    const retainUnsavedTarget = Boolean(targetFile && savedMap[newId] === false)
    const retainedTargetId = retainUnsavedTarget ? nextUntitled().id : ''
    const retainedTargetName = retainUnsavedTarget
      ? `${targetFile!.name.replace(/\.(md|markdown)$/i, '')} 未保存副本.md`
      : ''
    const retainedTargetContent = retainUnsavedTarget ? contents[newId] ?? '' : ''
    const retainedTargetBaseline = retainUnsavedTarget
      ? INITIAL_OR_SAVED.current[newId] ?? ''
      : ''
    const modifiedTime = result.data.modifiedTime || Date.now()
    const latestContent = contentsRef.current[oldId]
    const hasLatePendingInput = editorRef.current?.hasPendingChanges() ?? false
    const receipt = resolveSaveReceipt(content, latestContent, hasLatePendingInput)

    // 文件身份以磁盘路径为准。另存为后若仍沿用 untitled-/旧路径 ID，
    // 从工作区再次打开同一文件会生成重复标签，重命名和移动也无法命中它。
    if (retainUnsavedTarget) {
      // 保存对话框只感知磁盘文件，无法得知另一个已打开标签中的未保存内容。
      // 目标路径被覆盖后，把该标签转为无路径副本，避免内容被静默丢弃。
      INITIAL_OR_SAVED.current[retainedTargetId] = retainedTargetBaseline
    }
    INITIAL_OR_SAVED.current[newId] = content
    if (newId !== oldId) delete INITIAL_OR_SAVED.current[oldId]
    const nextOpenFiles = (() => {
      const current = openFilesRef.current
      if (newId === oldId) {
        return current.map((file) => (file.id === oldId ? { ...file, path, name } : file))
      }
      if (targetAlreadyOpen && retainUnsavedTarget) {
        return current.flatMap((file) => {
          if (file.id === oldId) return []
          if (file.id !== newId) return [file]
          return [
            { id: newId, name, path },
            { ...file, id: retainedTargetId, name: retainedTargetName, path: undefined, preview: false },
          ]
        })
      }
      if (targetAlreadyOpen) return current.filter((file) => file.id !== oldId)
      return current.map((file) =>
        file.id === oldId ? { id: newId, name, path } : file,
      )
    })()
    // 另存为会改变文件 ID，必须立即同步镜像，避免编辑器回调写入旧 ID。
    openFilesRef.current = nextOpenFiles
    const nextContents = { ...contentsRef.current, [newId]: receipt.content }
    if (newId !== oldId) delete nextContents[oldId]
    if (retainUnsavedTarget) nextContents[retainedTargetId] = retainedTargetContent
    contentsRef.current = nextContents
    setOpenFiles(nextOpenFiles)
    setContents((prev) => {
      const next = { ...prev, [newId]: receipt.content }
      if (newId !== oldId) delete next[oldId]
      if (retainUnsavedTarget) next[retainedTargetId] = retainedTargetContent
      return next
    })
    setSavedMap((prev) => {
      const next = { ...prev, [newId]: receipt.saved }
      if (newId !== oldId) delete next[oldId]
      if (retainUnsavedTarget) next[retainedTargetId] = false
      return next
    })
    // 优先用主进程返回的真实落盘 mtime，缺失时降级用当前时间（下次保存用于冲突检测）
    setFileMtime((prev) => {
      const next = { ...prev, [newId]: modifiedTime }
      if (newId !== oldId) delete next[oldId]
      return next
    })
    if (result.data.contentSha256) {
      setContentHashMap((prev) => {
        const next = { ...prev, [newId]: result.data!.contentSha256! }
        if (newId !== oldId) delete next[oldId]
        return next
      })
      contentHashRef.current = {
        ...contentHashRef.current,
        [newId]: result.data.contentSha256,
      }
      if (newId !== oldId) {
        const { [oldId]: _removed, ...rest } = contentHashRef.current
        contentHashRef.current = rest
        void _removed
      }
    }
    // 另存为统一写 UTF-8，重置编码记录，避免后续保存误用旧编码
    setEncodingMap((prev) => {
      const next = { ...prev, [newId]: 'UTF-8' }
      if (newId !== oldId) delete next[oldId]
      return next
    })
    if (draftPendingRef.current?.id === oldId) draftPendingRef.current = null
    activeFileIdRef.current = newId
    setActiveFileId(newId)
    setDocTitle(name)
    // M7：另存为改变文档目录后，编辑器内 mdimg 仍按旧目录解析；
    // 按新目录重新迁移并重渲染，否则下一键保存就把旧目录绝对路径写进新文件
    if (newId !== oldId) {
      replaceEditorContent(newId, receipt.content, 'update')
    }
    void clearDraft(oldId)
    if (newId !== oldId && receipt.saved) void clearDraft(newId)
    if (!receipt.saved) void saveDraft(newId, receipt.content).catch(() => {})
    finishSave(newId, epoch, 'idle')
    if (retainUnsavedTarget) {
      void saveDraft(retainedTargetId, retainedTargetContent).catch(() => {})
      setToast('已覆盖目标文件，原未保存内容已保留为副本')
      onDocumentPathCommitted?.({
        previousDocumentId: oldId,
        previousPath: targetPath,
        nextPath: path,
      })
      return
    }
    if (targetAlreadyOpen) setToast('已覆盖并切换到已打开的同名文件')
    onDocumentPathCommitted?.({
      previousDocumentId: oldId,
      previousPath: targetPath,
      nextPath: path,
    })
  }, [INITIAL_OR_SAVED, activeFileId, activeFileIdRef, activeSessionRef, beginSave, clearDraft, contents, contentsRef, contentHashRef, dirOfFile, draftPendingRef, editorRef, finishSave, mounted, onDocumentPathCommitted, openFilesRef, recordHistory, recordRecent, replaceEditorContent, saveDraft, savedMap, setActiveFileId, setContents, setContentHashMap, setDocTitle, setEncodingMap, setFileMtime, setOpenFiles, setSavedMap, setToast, snapshotSettleTimeoutMs])

  const handleSave = useCallback(async () => {
    const file = openFiles.find((f) => f.id === activeFileId)
    if (!file) return
    const targetSession = activeSessionRef.current
    let content: string
    if (shouldPreferCachedDocumentSnapshot(contentsRef.current[activeFileId] ?? contents[activeFileId] ?? '')) {
      // T05 快照契约：大文档保存必须先确保快照含末次输入——防抖窗口内的输入
      // 尚未落账时等待 markdownUpdated 落账，避免把防抖前的旧版本写盘
      // （perf:electron 实测 diskHasEdit:false 的根因）。等待超时或目标会话
      // 改变时不能提交旧缓存：它并不代表本次保存请求的编辑版本。
      const outcome = await ensureFreshSnapshot({
        hasPendingChanges: () => editorRef.current?.hasPendingChanges() ?? false,
        readSnapshot: () => contentsRef.current[activeFileId] ?? contents[activeFileId] ?? '',
        isTargetCurrent: () => (
          activeFileIdRef.current === activeFileId
          && activeSessionRef.current === targetSession
          && openFilesRef.current.some((candidate) => candidate.id === activeFileId)
        ),
      }, snapshotSettleTimeoutMs)
      if (!outcome.settled) {
        setToast(
          outcome.reason === 'target-changed'
            ? '文档已切换，未保存可能过期的快照；请返回原文档后重试'
            : '文档仍在生成快照，未保存旧版本；请稍后再次保存',
        )
        return
      }
      content = outcome.content
    } else {
      // M1：普通文档从编辑器同步读取，避免防抖窗口内丢失最后几键。
      // 同步 getMarkdown 的低延迟语义在此保留（规范：不机械换成 Promise）。
      const editorMd = editorRef.current?.isReady() ? editorRef.current.getMarkdown() : null
      content = editorMd != null
        ? toStoredImages(editorMd, dirOfFile(activeFileId))
        : contentsRef.current[activeFileId] ?? contents[activeFileId] ?? ''
    }
    // 同步编辑器读取的普通文档快照。大文档内容来自已落账的 contentsRef，
    // 不能在异步等待后用旧值覆盖期间已经抵达的新输入。
    if (
      !shouldPreferCachedDocumentSnapshot(contentsRef.current[activeFileId] ?? contents[activeFileId] ?? '')
      && contentsRef.current[activeFileId] !== content
    ) {
      contentsRef.current = { ...contentsRef.current, [activeFileId]: content }
      setContents((prev) => (prev[activeFileId] === content ? prev : { ...prev, [activeFileId]: content }))
    }

    // 有磁盘路径：直接保存（带外部冲突检测）
    if (file.path && window.desktopAPI) {
      const epoch = beginSave(activeFileId)
      const expectedMtime = fileMtimeRef.current[activeFileId] ?? fileMtime[activeFileId]
      const doSave = (withCheck: boolean) =>
        withCheck
          ? saveWithEncodingFallback(file.path!, content, expectedMtime, activeFileId, true)
          : saveWithEncodingFallback(
              file.path!,
              content,
              undefined,
              activeFileId,
              true,
              { forceOverwrite: true },
            )
      let result = await doSave(true)
      if (!result.ok && result.error?.code === 'CONFLICT') {
        // L1：磁盘内容与本次写入一致时是自冲突（上次保存后 mtime 未回填等），
        // 静默视为保存成功；确实被外部修改才弹确认
        const selfVersion = await resolveSelfConflict(file.path, content)
        if (selfVersion !== null) {
          result = {
            ok: true,
            data: {
              modifiedTime: selfVersion.modifiedTime,
              size: selfVersion.size,
              contentSha256: selfVersion.contentSha256,
            },
          }
        } else {
          const overwrite = window.confirm(
            '该文件已被其他程序修改，仍然要覆盖保存吗？\n\n选择"取消"可保留当前编辑内容，稍后另存为。',
          )
          if (!overwrite) {
            finishSave(activeFileId, epoch, 'conflict')
            return
          }
          result = await doSave(false)
        }
      }
      if (result.ok && result.data) {
        const currentFile = openFilesRef.current.find((openFile) => openFile.id === activeFileId)
        if (!currentFile) {
          finishSave(activeFileId, epoch, 'idle')
          return
        }
        // mtime 与保存基线只能属于发起请求时的路径。重命名或移动已将
        // 同一标签指向新文件时，旧路径回执不能把新路径误标为已保存。
        if (currentFile.path !== file.path) {
          finishSave(activeFileId, epoch, 'idle')
          setToast('文件路径已变更，未将旧保存结果套用到当前标签')
          return
        }
        INITIAL_OR_SAVED.current[activeFileId] = content
        // 磁盘回执只确认已提交的快照。若 IPC 等待期间编辑器又收到尚未
        // markdownUpdated 落账的输入，缓存仍可能恰好相等，也必须保留 dirty。
        const sessionStillCurrent = activeFileIdRef.current === activeFileId
          && activeSessionRef.current === targetSession
        const receipt = resolveSaveReceipt(
          content,
          contentsRef.current[activeFileId],
          sessionStillCurrent && (editorRef.current?.hasPendingChanges() ?? false),
        )
        setSavedMap((prev) => ({ ...prev, [activeFileId]: receipt.saved }))
        // 晚到回执只确认实际写出的版本；编辑期间新内容保持 dirty（receipt.saved）。
        setFileMtime((prev) => ({ ...prev, [activeFileId]: result.data!.modifiedTime }))
        fileMtimeRef.current = { ...fileMtimeRef.current, [activeFileId]: result.data!.modifiedTime }
        if (result.data.contentSha256) {
          setContentHashMap((prev) => ({ ...prev, [activeFileId]: result.data!.contentSha256 }))
          contentHashRef.current = {
            ...contentHashRef.current,
            [activeFileId]: result.data.contentSha256,
          }
        }
        if (receipt.saved) {
          void clearDraft(activeFileId)
          cancelAutoSave(activeFileId, content)
        }
        recordHistory(file.path)
        finishSave(activeFileId, epoch, 'idle')
      } else if (result.error?.code === 'ENCODING_LOSS') {
        finishSave(activeFileId, epoch, 'encoding')
      } else {
        finishSave(activeFileId, epoch, 'failed')
        setToast(
          result.error?.code === 'NOT_FOUND'
            ? '原文件已不存在，请使用另存为保存当前内容'
            : result.error?.code === 'SAVE_LOCKED'
              ? '另一个窗口正在保存该文件，请稍后重试'
              : '保存失败，请检查文件权限或磁盘空间',
        )
      }
      return
    }
    // 无路径：另存为
    await handleSaveAs()
  }, [INITIAL_OR_SAVED, activeFileId, activeFileIdRef, activeSessionRef, beginSave, cancelAutoSave, contents, contentsRef, contentHashRef, dirOfFile, editorRef, fileMtime, fileMtimeRef, finishSave, openFiles, openFilesRef, resolveSelfConflict, recordHistory, saveWithEncodingFallback, handleSaveAs, clearDraft, setContents, setContentHashMap, setFileMtime, setSavedMap, setToast, snapshotSettleTimeoutMs])

  const saveBeforeClose = useDocumentCloseSaving({
    state, editorRef, saveQueueApi, liveContentOf, recordRecent, setToast, snapshotSettleTimeoutMs,
  })
  // 未保存状态同步到主进程（关闭时弹原生确认框，避免静默阻止关闭）
  const hasUnsaved = useMemo(() => Object.values(savedMap).some((s) => !s), [savedMap])
  useEffect(() => {
    window.desktopAPI?.window.setUnsaved(hasUnsaved)
  }, [hasUnsaved])

  return { handleSave, handleSaveAs, saveBeforeClose, saveActivity }
}
