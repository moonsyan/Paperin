import { useCallback, useEffect, useMemo } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { toStoredImages } from '../../lib/image-path'
import { isDocumentDirty } from '../../lib/document-tabs'
import { requestConfirm } from '../../lib/confirm-dialog'
import type { PendingDraft } from '../../hooks/useDraftPersistence'
import { nextUntitled } from '../constants'
import type { DocumentState } from './useDocumentState'
import type { DocumentSaveQueueApi } from './useDocumentSaveQueue'
import type { EditorHandle } from '../../components/Editor'

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
}

export interface DocumentSavingApi {
  handleSave: () => Promise<void>
  handleSaveAs: () => Promise<void>
  saveBeforeClose: (id: string) => Promise<boolean>
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
}: UseDocumentSavingOptions): DocumentSavingApi {
  const {
    activeFileId,
    activeFileIdRef,
    contents,
    contentsRef,
    fileMtime,
    initialOrSavedRef: INITIAL_OR_SAVED,
    openFiles,
    openFilesRef,
    savedMap,
    setActiveFileId,
    setContents,
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
    saveQueueRef,
  } = saveQueueApi

  const handleSaveAs = useCallback(async () => {
    if (!window.desktopAPI) return
    const oldId = activeFileId
    // M1：与 handleSave 一致，从编辑器同步读取最新内容
    const editorMd = editorRef.current?.isReady() ? editorRef.current.getMarkdown() : null
    const content =
      editorMd != null
        ? toStoredImages(editorMd, dirOfFile(oldId))
        : (contents[oldId] ?? '')
    const result = await window.desktopAPI.document.saveAs(content)
    if (!result.ok || !result.data) {
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
    setOpenFiles(nextOpenFiles)
    setContents((prev) => {
      const next = { ...prev, [newId]: content }
      if (newId !== oldId) delete next[oldId]
      if (retainUnsavedTarget) next[retainedTargetId] = retainedTargetContent
      return next
    })
    setSavedMap((prev) => {
      const next = { ...prev, [newId]: true }
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
      replaceEditorContent(newId, content, 'update')
    }
    void clearDraft(oldId)
    if (newId !== oldId) void clearDraft(newId)
    if (retainUnsavedTarget) {
      void saveDraft(retainedTargetId, retainedTargetContent).catch(() => {})
      setToast('已覆盖目标文件，原未保存内容已保留为副本')
      return
    }
    if (targetAlreadyOpen) setToast('已覆盖并切换到已打开的同名文件')
  }, [INITIAL_OR_SAVED, activeFileId, activeFileIdRef, clearDraft, contents, dirOfFile, draftPendingRef, editorRef, openFilesRef, recordHistory, recordRecent, replaceEditorContent, saveDraft, savedMap, setActiveFileId, setContents, setDocTitle, setEncodingMap, setFileMtime, setOpenFiles, setSavedMap, setToast])

  const handleSave = useCallback(async () => {
    const file = openFiles.find((f) => f.id === activeFileId)
    // M1：Milkdown onChange 经过防抖，contents state 可能滞后最后几键。
    // 保存时直接从编辑器同步读取最新内容（回写 mdimg 相对路径），避免丢失末次输入
    const editorMd = editorRef.current?.isReady() ? editorRef.current.getMarkdown() : null
    const content =
      editorMd != null
        ? toStoredImages(editorMd, dirOfFile(activeFileId))
        : (contents[activeFileId] ?? '')
    if (!file) return
    // 同步回填 state，保证后续 savedMap/INITIAL_OR_SAVED 比对基于最新内容
    if (contentsRef.current[activeFileId] !== content) {
      contentsRef.current = { ...contentsRef.current, [activeFileId]: content }
      setContents((prev) => (prev[activeFileId] === content ? prev : { ...prev, [activeFileId]: content }))
    }

    // 有磁盘路径：直接保存（带外部冲突检测）
    if (file.path && window.desktopAPI) {
      const doSave = (withCheck: boolean) =>
        saveWithEncodingFallback(
          file.path!,
          content,
          withCheck ? fileMtime[activeFileId] : undefined,
          activeFileId,
          true,
        )
      let result = await doSave(true)
      if (!result.ok && result.error?.code === 'CONFLICT') {
        // L1：磁盘内容与本次写入一致时是自冲突（上次保存后 mtime 未回填等），
        // 静默视为保存成功；确实被外部修改才弹确认
        const selfMtime = await resolveSelfConflict(file.path, content)
        if (selfMtime !== null) {
          result = { ok: true, data: { modifiedTime: selfMtime } }
        } else {
          const overwrite = window.confirm(
            '该文件已被其他程序修改，仍然要覆盖保存吗？\n\n选择"取消"可保留当前编辑内容，稍后另存为。',
          )
          if (!overwrite) return
          result = await doSave(false)
        }
      }
      if (result.ok && result.data) {
        if (!openFilesRef.current.some((openFile) => openFile.id === activeFileId)) return
        INITIAL_OR_SAVED.current[activeFileId] = content
        const isCurrentContent = contentsRef.current[activeFileId] === content
        setSavedMap((prev) => ({ ...prev, [activeFileId]: isCurrentContent }))
        setFileMtime((prev) => ({ ...prev, [activeFileId]: result.data!.modifiedTime }))
        if (isCurrentContent) void clearDraft(activeFileId)
        recordHistory(file.path)
      } else if (result.error?.code !== 'ENCODING_LOSS') {
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
  }, [INITIAL_OR_SAVED, activeFileId, contents, contentsRef, dirOfFile, editorRef, fileMtime, openFiles, openFilesRef, resolveSelfConflict, recordHistory, saveWithEncodingFallback, handleSaveAs, clearDraft, setContents, setFileMtime, setSavedMap, setToast])

  const saveBeforeClose = useCallback(async (id: string): Promise<boolean> => {
    const file = openFilesRef.current.find((candidate) => candidate.id === id)
    if (!file) return true
    const content = liveContentOf(id)
    if (!file.path) {
      const dirty = isDocumentDirty(content, INITIAL_OR_SAVED.current[id] ?? '')
      if (!dirty) return true
      // 空白未命名文档无实质内容，直接丢弃不弹确认框
      if (!content.trim()) return true
      if (!window.desktopAPI) return false
      // T1：关闭前决策交给用户——此前无条件弹另存为且取消即无法关闭，
      // 未命名/演示文档没有任何"放弃修改"出口。现在提供三选，
      // "不保存"直接关闭，"取消"保留文档原样
      const choice = await requestConfirm({
        title: '关闭文档',
        message: `「${file.name}」尚未保存。是否保存并关闭？`,
        buttons: [
          { id: 'save', label: '保存', kind: 'primary' },
          { id: 'discard', label: '不保存', kind: 'danger' },
          { id: 'cancel', label: '取消' },
        ],
        defaultId: 'save',
      })
      if (choice === 'cancel') return false
      if (choice === 'discard') return true
      const result = await window.desktopAPI.document.saveAs(content, {
        defaultPath: file.name,
      })
      if (!result.ok || !result.data) {
        if (result.error?.code !== 'CANCELLED') setToast(`保存失败：${file.name}`)
        // 另存为对话框被取消同样视为放弃本次关闭，标签/窗口保持原样
        return false
      }
      recordRecent(result.data.path, result.data.name)
      return true
    }

    try {
      await saveQueueRef.current?.flush(id)
    } catch {
      // 首次冲刷失败不立刻中止：下方仍按最新实时内容再排一次写回；
      // 仍失败则由最终 catch 交给用户决策（放弃修改/取消）
    }
    const currentContent = liveContentOf(id)
    if (!isDocumentDirty(currentContent, INITIAL_OR_SAVED.current[id] ?? '')) return true
    saveQueueRef.current?.schedule(id, {
      path: file.path,
      name: file.name,
      content: currentContent,
    })
    try {
      await saveQueueRef.current?.flush(id)
      return !isDocumentDirty(contentsRef.current[id] ?? currentContent, INITIAL_OR_SAVED.current[id] ?? '')
    } catch {
      // 无法落盘（外部修改冲突/编码限制/磁盘只读）：不再静默中止关闭，
      // 让用户选择放弃修改并关闭，而不是只能取消后干等
      const choice = await requestConfirm({
        title: '关闭文档',
        message: `「${file.name}」未能保存（文件可能已被外部修改或磁盘不可写）。仍要关闭并放弃这些修改吗？`,
        buttons: [
          { id: 'discard', label: '放弃修改', kind: 'danger' },
          { id: 'cancel', label: '取消' },
        ],
        defaultId: 'cancel',
      })
      return choice === 'discard'
    }
  }, [INITIAL_OR_SAVED, contentsRef, liveContentOf, openFilesRef, recordRecent, saveQueueRef, setToast])

  // 未保存状态同步到主进程（关闭时弹原生确认框，避免静默阻止关闭）
  const hasUnsaved = useMemo(() => Object.values(savedMap).some((s) => !s), [savedMap])
  useEffect(() => {
    window.desktopAPI?.window.setUnsaved(hasUnsaved)
  }, [hasUnsaved])

  return { handleSave, handleSaveAs, saveBeforeClose }
}
