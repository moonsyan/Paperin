import { useCallback } from 'react'
import type { RefObject } from 'react'
import type { DraftMap } from '../../lib/drafts'
import type { OpenFile } from '../../components/Sidebar'
import { DEMO_FILES, DEFAULT_FILE_ID } from '../../data/demo-files'
import {
  FRESH_FILE_PATH,
  FRESH_MODE,
  INITIAL_CONTENTS,
  INITIAL_FILES,
  reserveUntitledCounter,
} from '../constants'
import type { SessionData } from '../../hooks/useDocumentSessionPersistence'
import { resolveRestoredActiveFileId } from './restore-target'
import type { DocumentState } from './useDocumentState'
import type { EditorHandle } from '../../components/Editor'

export interface UseDocumentRestoreOptions {
  state: DocumentState
  editorRef: RefObject<EditorHandle>
  setToast: (message: string) => void
  handleOpenFolder: (path?: string, silent?: boolean, preserveActiveTab?: boolean) => Promise<void>
  handleSelectWorkspaceFile: (path: string, pinned?: boolean) => Promise<boolean>
  replaceEditorContent: (
    fileId: string,
    content: string,
    mode?: 'initialize' | 'update' | 'ignore',
  ) => void
}

/** 会话恢复（启动初始化调用）：重新打开上次的磁盘文件与未命名文档、
 *  回滚未保存草稿、恢复上次的工作区文件夹与活动文档，并处理
 *  fresh 窗口携带的待打开文件。从 useDocumentSession 原样迁移。 */
export function useDocumentRestore({
  state,
  editorRef,
  setToast,
  handleOpenFolder,
  handleSelectWorkspaceFile,
  replaceEditorContent,
}: UseDocumentRestoreOptions) {
  const {
    activeFileIdRef,
    initialOrSavedRef: INITIAL_OR_SAVED,
    openFilesRef,
    setActiveFileId,
    setContents,
    setDocTitle,
    setEncodingMap,
    setFileMtime,
    setOpenFiles,
    setSavedMap,
  } = state

  // useCallback 保证引用稳定：App 的启动初始化 effect 只允许执行一次，
  // 依赖数组必须能安全包含本函数而不引发重复恢复
  const restoreFromSessionData = useCallback(async (session: SessionData | null, drafts: DraftMap) => {
    // fresh 窗口（多窗口模式新建）不恢复会话，避免多窗口互相覆盖
    const effectiveSession = FRESH_MODE ? null : session
    // fresh 窗口也不恢复全局草稿：草稿属于主窗口会话，灌入未打开文件的脏状态会让新窗口"天生未保存"且无法关闭
    const effectiveDrafts = FRESH_MODE ? {} : drafts

    /* ---- 会话恢复：重新打开上次的磁盘文件与未命名文档 ---- */
    const restoredFiles: OpenFile[] = []
    const restoredContents: Record<string, string> = {}
    const restoredMtimes: Record<string, number> = {}
    const restoredEncodings: Record<string, string> = {}
    const seenIds = new Set<string>()
    // 防御：会话文件列表去重 + 上限（历史上曾因重复累积膨胀到几十万条导致启动 OOM）
    const sessionFiles = (effectiveSession?.files ?? []).slice(0, 200)
    for (const entry of sessionFiles) {
      if (!entry || !entry.id || seenIds.has(entry.id)) continue
      seenIds.add(entry.id)
      if (DEMO_FILES[entry.id]) continue
      if (entry.path) {
        const res = await window.desktopAPI.document.read(entry.path)
        if (res.ok && res.data) {
          restoredFiles.push({ id: entry.id, name: res.data.name, path: entry.path })
          restoredContents[entry.id] = res.data.content
          restoredMtimes[entry.id] = res.data.modifiedTime
          if (res.data.encoding) restoredEncodings[entry.id] = res.data.encoding
        }
      } else if (entry.name) {
        restoredFiles.push({ id: entry.id, name: entry.name })
        restoredContents[entry.id] = ''
      }
    }
    if (Object.keys(restoredEncodings).length) {
      setEncodingMap((prev) => ({ ...prev, ...restoredEncodings }))
    }
    // H7：会话恢复的未命名标签（untitled-N）可能占用新标签 ID，
    // 启动时把自增计数推进到已恢复的最大编号，避免 Ctrl+N 创建重复 ID
    for (const f of restoredFiles) {
      const match = /^untitled-(\d+)$/.exec(f.id)
      if (match) {
        reserveUntitledCounter(Number(match[1]))
      }
    }

    /* ---- 草稿恢复：未保存的编辑内容回滚 ---- */
    const dirtyIds: string[] = []
    const baselineById: Record<string, string> = {}
    for (const [id, d] of Object.entries(effectiveDrafts)) {
      // 基线：磁盘文件用读到的内容，演示文件用初始内容
      const baseline =
        id in restoredContents ? restoredContents[id] : INITIAL_CONTENTS[id]
      if (baseline === undefined || d.content === baseline) continue
      // B6：恢复草稿前重新 stat 磁盘文件；若读取后又被外部修改，
      // 则丢弃草稿以磁盘最新内容为准，避免旧草稿覆盖新修改
      const fl = restoredFiles.find((x) => x.id === id)
      if (fl?.path) {
        const st = await window.desktopAPI.document.stat(fl.path)
        if (st.ok && st.data) {
          // 磁盘 mtime 比草稿保存时刻还新 = 草稿保存后文件被外部修改：
          // 草稿是旧内容，恢复会覆盖外部新修改——丢弃草稿以磁盘为准
          //（保存成功后草稿会被清除，正常残留草稿的 savedAt 必然晚于
          //  最后保存 mtime；只有崩溃残留或外部修改才会触发此分支）
          if (typeof d.savedAt === 'number' && st.data.modifiedTime > d.savedAt) continue
          if (Math.abs(st.data.modifiedTime - (restoredMtimes[id] ?? 0)) > 3000) continue
        }
      }
      baselineById[id] = baseline
      restoredContents[id] = d.content
      dirtyIds.push(id)
    }

    if (restoredFiles.length) {
      // 同步更新 ref，首次替换编辑器内容时才能正确解析恢复文件的相对图片路径。
      const existing = new Set(openFilesRef.current.map((file) => file.id))
      const nextOpenFiles = [
        ...openFilesRef.current,
        ...restoredFiles.filter((file) => !existing.has(file.id)),
      ]
      openFilesRef.current = nextOpenFiles
      setOpenFiles(nextOpenFiles)
    }
    if (Object.keys(restoredContents).length) {
      setContents((prev) => ({ ...prev, ...restoredContents }))
    }
    // 脏检查基线：干净文件用恢复内容，脏文件用草稿应用前的基线
    Object.assign(INITIAL_OR_SAVED.current, restoredContents)
    Object.assign(INITIAL_OR_SAVED.current, baselineById)
    setSavedMap((prev) => {
      const next = { ...prev }
      restoredFiles.forEach((fl) => {
        next[fl.id] = !dirtyIds.includes(fl.id)
      })
      dirtyIds.forEach((id) => {
        next[id] = false
      })
      return next
    })
    if (Object.keys(restoredMtimes).length) {
      setFileMtime((prev) => ({ ...prev, ...restoredMtimes }))
    }
    if (dirtyIds.length) {
      setToast(`已恢复 ${dirtyIds.length} 篇未保存草稿`)
    }

    /* ---- 恢复上次激活的文档 ---- */
    const allIds = new Set([
      ...INITIAL_FILES.map((fl) => fl.id),
      ...restoredFiles.map((fl) => fl.id),
    ])

    /* ---- 恢复上次的工作区文件夹（静默：空文件夹不重复新建文档） ---- */
    if (effectiveSession?.workspacePath) {
      // preserveActiveTab：活动文档由下方会话恢复逻辑决定，工作区恢复不覆盖
      void handleOpenFolder(effectiveSession.workspacePath, true, true)
    }
    const target = resolveRestoredActiveFileId(
      effectiveSession?.activeFileId,
      allIds,
      DEFAULT_FILE_ID,
    )
    if (target !== activeFileIdRef.current) {
      activeFileIdRef.current = target
      setActiveFileId(target)
      const file =
        restoredFiles.find((fl) => fl.id === target) ??
        INITIAL_FILES.find((fl) => fl.id === target)
      setDocTitle(file?.name ?? '未命名文档')
    }
    // 等编辑器就绪后应用最终内容（创建是异步的，重试至多 2 秒）
    const finalContent = restoredContents[target] ?? INITIAL_CONTENTS[target] ?? ''
    let tries = 0
    const tryApply = () => {
      if (editorRef.current?.isReady()) {
        // 渲染前解析相对路径图片；此时 openFilesRef 已含恢复文件
        replaceEditorContent(
          target,
          finalContent,
          dirtyIds.includes(target) ? 'ignore' : 'initialize',
        )
      } else if (tries++ < 20) {
        setTimeout(tryApply, 100)
      } else {
        // 2 秒仍不可用：不静默失败，给用户可操作的提示
        setToast('编辑器未就绪，已恢复的文件内容可能未加载，请刷新窗口')
      }
    }
    tryApply()

    /* ---- fresh 窗口携带的文件：直接打开（右键"在新窗口打开"，U7） ---- */
    if (FRESH_FILE_PATH) {
      const freshFilePath = FRESH_FILE_PATH
      // 等编辑器创建完成再打开，避免 replaceContent 被静默跳过（重试至多 2 秒）
      let openTries = 0
      const openWhenReady = () => {
        if (editorRef.current?.isReady()) {
          void handleSelectWorkspaceFile(freshFilePath)
        } else if (openTries++ < 20) {
          setTimeout(openWhenReady, 100)
        }
      }
      openWhenReady()
    }
  }, [
    INITIAL_OR_SAVED,
    activeFileIdRef,
    editorRef,
    handleOpenFolder,
    handleSelectWorkspaceFile,
    openFilesRef,
    replaceEditorContent,
    setActiveFileId,
    setContents,
    setDocTitle,
    setEncodingMap,
    setFileMtime,
    setOpenFiles,
    setSavedMap,
    setToast,
  ])

  return { restoreFromSessionData }
}
