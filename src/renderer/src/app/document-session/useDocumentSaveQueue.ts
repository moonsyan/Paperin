import { useCallback, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type { SaveResult } from '../../../../preload/api'
import { DocumentSaveQueue, NonRetryableSaveError } from '../../lib/document-save-queue'
import type { DocumentState } from './useDocumentState'
import type { AutoSaveSnapshot } from './types'

export interface UseDocumentSaveQueueOptions {
  autosave: boolean
  state: DocumentState
  setToast: (message: string) => void
  clearDraft: (fileId: string) => Promise<void>
}

export interface DocumentSaveQueueApi {
  saveWithEncodingFallback: (
    path: string,
    content: string,
    expectedMtime: number | undefined,
    fileId: string,
    interactive?: boolean,
  ) => Promise<SaveResult>
  recordHistory: (path: string | undefined) => void
  resolveSelfConflict: (path: string, content: string) => Promise<number | null>
  scheduleAutoSave: (fileId: string, content: string) => void
  cancelAutoSave: (fileId: string, content: string) => void
  saveQueueRef: MutableRefObject<DocumentSaveQueue<AutoSaveSnapshot> | null>
}

/** 自动保存队列与保存底层能力：GBK 编码降级、版本快照记录、自冲突消解。
 *  从 useDocumentSession 原样迁移；须先于编辑器同步 hook 创建（同步回调
 *  需要 schedule/cancel）。 */
export function useDocumentSaveQueue({
  autosave,
  state,
  setToast,
  clearDraft,
}: UseDocumentSaveQueueOptions): DocumentSaveQueueApi {
  const {
    contentsRef,
    encodingMapRef,
    fileMtimeRef,
    initialOrSavedRef: INITIAL_OR_SAVED,
    openFilesRef,
    setEncodingMap,
    setFileMtime,
    setSavedMap,
  } = state

  /**
   * 带 GBK 降级的保存：主进程发现内容含 GBK 无法表示的字符（如 emoji）时
   * 返回 ENCODING_LOSS，此时降级为 UTF-8 保存（内容永不丢失，仅文件编码变化）。
   * interactive=true 手动保存先询问（window.confirm），确认后降级并更新编码映射；
   * 非 interactive（自动保存等后台路径）不降级，原样返回错误由调用方决定
   * 停止重试并提示用户手动处理（Ctrl+S 走交互降级）。
   */
  const saveWithEncodingFallback = useCallback(
    async (
      path: string,
      content: string,
      expectedMtime: number | undefined,
      fileId: string,
      interactive = false,
    ) => {
      if (!window.desktopAPI) {
        return { ok: false, error: { code: 'NO_API' } }
      }
      let res = await window.desktopAPI.document.save(
        path,
        content,
        expectedMtime,
        encodingMapRef.current[fileId],
      )
      if (!res.ok && res.error?.code === 'ENCODING_LOSS') {
        if (!interactive) return res
        const convert = window.confirm(
          '内容包含 GBK 无法表示的字符（如 emoji）。\n转为 UTF-8 保存会改变文件编码，是否继续？',
        )
        if (!convert) return res
        res = await window.desktopAPI.document.save(path, content, expectedMtime)
        if (res.ok) {
          setEncodingMap((prev) => ({ ...prev, [fileId]: 'UTF-8' }))
          setToast('文件含 GBK 无法表示的字符，已转为 UTF-8 保存')
        }
      }
      return res
    },
    [encodingMapRef, setEncodingMap, setToast],
  )

  /**
   * 版本历史快照：保存成功后由主进程读盘记录（fire-and-forget，
   * 失败静默——历史记录缺失不影响保存主流程）。
   */
  const recordHistory = useCallback((path: string | undefined) => {
    if (!path || !window.desktopAPI?.history) return
    window.desktopAPI.history.record(path).catch(() => {})
  }, [])

  /**
   * 自冲突消解：保存报 CONFLICT 时，若磁盘当前内容与本次写入内容一致，
   * 说明"冲突"其实是自己上次保存后的正常状态（如上一次保存成功后 mtime
   * 未及时回填、或编辑器内容未变又被重新保存），此时视为保存成功，
   * 不打扰用户。仅当磁盘内容确实不同才返回 null（真·外部修改）。
   */
  const resolveSelfConflict = useCallback(
    async (path: string, content: string): Promise<number | null> => {
      if (!window.desktopAPI) return null
      try {
        const reread = await window.desktopAPI.document.read(path)
        if (reread.ok && reread.data && reread.data.content === content) {
          return reread.data.modifiedTime
        }
      } catch {
        // 读取失败无法确认，按外部修改处理
      }
      return null
    },
    [],
  )

  const autosaveEnabledRef = useRef(autosave)
  autosaveEnabledRef.current = autosave
  const saveQueueRef = useRef<DocumentSaveQueue<AutoSaveSnapshot> | null>(null)
  if (!saveQueueRef.current) {
    saveQueueRef.current = new DocumentSaveQueue<AutoSaveSnapshot>(async (id, snapshot) => {
      // 记录已被重命名/移动/删除（其内容经文件操作前的交互式保存落盘）：
      // 队列里残留的旧路径快照必须作废——否则会对已不存在的路径无限退避
      // 重试并反复 toast，关窗 flushAll 还会因它 reject 导致窗口关不上
      if (!openFilesRef.current.some((candidate) => candidate.id === id)) return
      const result = await saveWithEncodingFallback(
        snapshot.path,
        snapshot.content,
        fileMtimeRef.current[id],
        id,
      )
      let modifiedTime = result.data?.modifiedTime ?? null
      if (!result.ok && result.error?.code === 'CONFLICT') {
        modifiedTime = await resolveSelfConflict(snapshot.path, snapshot.content)
      }
      if (modifiedTime === null) {
        const code = result.error?.code
        if (code === 'CONFLICT') setToast(`自动保存已跳过：${snapshot.name} 已被外部修改`)
        else if (code === 'ENCODING_LOSS') {
          // 重试永远得到同样结果（内容含当前编码无法表示的字符），
          // 抛不可重试错误终止自动保存循环，引导用户手动保存走交互降级
          setToast(`${snapshot.name} 包含当前编码无法保存的字符，已暂停自动保存，请按 Ctrl+S 选择处理方式`)
          throw new NonRetryableSaveError(code)
        }
        else setToast(`自动保存失败：${snapshot.name}`)
        throw new Error(code ?? 'SAVE_FAILED')
      }
      // await 期间该标签可能已被重命名/移动/关闭（id 迁走）：作废回填，
      // 否则会为已不存在的会话键复活 savedMap/fileMtime，产生幽灵脏标签
      if (!openFilesRef.current.some((candidate) => candidate.id === id)) return
      INITIAL_OR_SAVED.current[id] = snapshot.content
      // 队列会在当前 await 返回后立即处理下一快照，不能等 React 下一次渲染
      // 才刷新 ref；否则连续保存会拿旧 mtime 自己制造 CONFLICT。
      fileMtimeRef.current = { ...fileMtimeRef.current, [id]: modifiedTime }
      setFileMtime((prev) => ({ ...prev, [id]: modifiedTime }))
      const isCurrentContent = contentsRef.current[id] === snapshot.content
      setSavedMap((prev) => ({ ...prev, [id]: isCurrentContent }))
      if (isCurrentContent) void clearDraft(id)
      // 保存成功即记录版本快照（主进程读盘，fire-and-forget）
      recordHistory(snapshot.path)
    }, 1_000)
  }

  const scheduleAutoSave = useCallback((fileId: string, content: string) => {
    if (!autosaveEnabledRef.current) return
    const file = openFilesRef.current.find((candidate) => candidate.id === fileId)
    if (!file?.path) return
    saveQueueRef.current?.schedule(fileId, {
      path: file.path,
      name: file.name,
      content,
    })
  }, [openFilesRef])

  const cancelAutoSave = useCallback((fileId: string, content: string) => {
    const file = openFilesRef.current.find((candidate) => candidate.id === fileId)
    if (!file?.path) {
      saveQueueRef.current?.cancel(fileId)
      return
    }
    saveQueueRef.current?.cancel(fileId, {
      path: file.path,
      name: file.name,
      content,
    })
  }, [openFilesRef])

  return {
    saveWithEncodingFallback,
    recordHistory,
    resolveSelfConflict,
    scheduleAutoSave,
    cancelAutoSave,
    saveQueueRef,
  }
}
