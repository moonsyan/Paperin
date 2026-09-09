import { useCallback, useEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { toStoredImages } from '../../lib/image-path'
import {
  findDiscardablePreview,
  getClosableTabIds,
  reorderTabsWithinGroup,
  togglePinnedTab,
} from '../../lib/document-tabs'
import { flushPersistedSettings } from '../../hooks/usePersistedSetting'
import type { PendingDraft } from '../../hooks/useDraftPersistence'
import {
  updateWorkspaceDocumentView,
  toWorkspaceRelativePath,
} from '../../lib/workspace-state'
import type { WorkspaceDocumentsState } from '../../../../shared/workspace-state'
import { DEMO_FILES, DEFAULT_FILE_ID } from '../../data/demo-files'
import { nextUntitled } from '../constants'
import type { DocumentState } from './useDocumentState'
import type { AutoSaveSnapshot } from './types'
import type { EditorHandle } from '../../components/Editor'
import { sameFilePath } from './filePath'
import type { DocumentSaveQueue } from '../../lib/document-save-queue'

export interface UseDocumentTabsOptions {
  state: DocumentState
  editorRef: RefObject<EditorHandle>
  titleRef: RefObject<HTMLDivElement>
  flushEditorContent: () => void
  replaceEditorContent: (
    fileId: string,
    content: string,
    mode?: 'initialize' | 'update' | 'ignore',
  ) => void
  pinPreviewTab: (fileId: string) => void
  dirOfFile: (fileId: string) => string | undefined
  saveBeforeClose: (id: string) => Promise<boolean>
  saveQueueRef: MutableRefObject<DocumentSaveQueue<AutoSaveSnapshot> | null>
  clearDraft: (fileId: string) => Promise<void>
  draftPendingRef: MutableRefObject<PendingDraft | null>
  focusEditorSoon: () => void
  recordRecent: (path: string, name: string) => void
  setToast: (message: string) => void
  workspacePathRef: MutableRefObject<string | undefined>
  workspaceDocumentsRef: MutableRefObject<WorkspaceDocumentsState>
  setWorkspaceDocuments: (next: WorkspaceDocumentsState) => void
  /** 最后一次文件选择意图；较早的慢读取完成后不得反向抢占当前文件。 */
  latestWorkspaceSelectionRef: MutableRefObject<string>
  openingWorkspaceFilesRef: MutableRefObject<Map<string, Promise<boolean>>>
}

export interface DocumentTabsApi {
  discardPreviewTab: (fileId: string) => void
  switchFile: (id: string) => void
  handleNew: () => void
  handleSelectDemoFile: (id: string, pinned?: boolean) => void
  handleOpen: () => Promise<void>
  handleSelectWorkspaceFile: (path: string, pinned?: boolean) => Promise<boolean>
  captureWorkspaceDocumentView: (fileId: string) => void
  restoreWorkspaceDocumentView: (fileId: string, tries?: number) => void
  removeClosedTabs: (ids: string[]) => void
  saveAllBeforeWindowClose: () => Promise<boolean>
  handleCloseTab: (id: string) => Promise<void>
  handleCloseOtherTabs: (targetId: string) => void
  handleCloseAllTabs: () => void
  handleTogglePinnedTab: (id: string) => void
  handleReorderTabs: (from: number, to: number) => void
}

/** 标签生命周期：新建、打开、切换、预览升级/丢弃、关闭、固定与排序，
 *  以及关窗前的逐个保存编排和工作区文档视图（选区/滚动）持久化。
 *  从 useDocumentSession 原样迁移。 */
export function useDocumentTabs({
  state,
  editorRef,
  titleRef,
  flushEditorContent,
  replaceEditorContent,
  pinPreviewTab,
  dirOfFile,
  saveBeforeClose,
  saveQueueRef,
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
}: UseDocumentTabsOptions): DocumentTabsApi {
  const {
    activeFileIdRef,
    contentsRef,
    initialOrSavedRef: INITIAL_OR_SAVED,
    openFiles,
    openFilesRef,
    setActiveFileId,
    setContents,
    setDocTitle,
    setEncodingMap,
    setFileMtime,
    setOpenFiles,
    setSavedMap,
  } = state

  /** 侧栏打开下一个预览前丢弃前一个未修改的预览标签。 */
  const discardPreviewTab = useCallback((nextFileId: string) => {
    const previous = findDiscardablePreview(openFilesRef.current, nextFileId)
    if (!previous) return
    // H-L2：被丢弃的预览若是活动文档，且防抖窗口内刚有输入（编辑器实时
    // 内容未落账），直接丢弃会丢末次输入——先落账并自动固定，与编辑自动
    // pin 机制（markdownUpdated 里脏内容 → pinPreviewTab）行为一致。
    // 此时外层调用还会继续打开下一个文件，两个标签并存，内容不丢。
    if (previous.id === activeFileIdRef.current && editorRef.current?.isReady()) {
      const md = editorRef.current.getMarkdown()
      if (md !== null) {
        const stored = toStoredImages(md, dirOfFile(previous.id))
        if (stored !== (contentsRef.current[previous.id] ?? '')) {
          flushEditorContent()
          pinPreviewTab(previous.id)
          return
        }
      }
    }
    openFilesRef.current = openFilesRef.current.filter((file) => file.id !== previous.id)
    setOpenFiles((prev) => prev.filter((file) => file.id !== previous.id))
    setContents((prev) => {
      const next = { ...prev }
      delete next[previous.id]
      return next
    })
    setSavedMap((prev) => {
      const next = { ...prev }
      delete next[previous.id]
      return next
    })
    setFileMtime((prev) => {
      const next = { ...prev }
      delete next[previous.id]
      return next
    })
    setEncodingMap((prev) => {
      const next = { ...prev }
      delete next[previous.id]
      return next
    })
    delete INITIAL_OR_SAVED.current[previous.id]
  }, [INITIAL_OR_SAVED, activeFileIdRef, contentsRef, dirOfFile, editorRef, flushEditorContent, openFilesRef, pinPreviewTab, setContents, setEncodingMap, setFileMtime, setOpenFiles, setSavedMap])

  /** 保存工作区内磁盘文件的选区与滚动位置，不记录未命名或工作区外文件。 */
  const captureWorkspaceDocumentView = useCallback((fileId: string) => {
    const rootPath = workspacePathRef.current
    const file = openFilesRef.current.find((candidate) => candidate.id === fileId)
    const viewState = editorRef.current?.getViewState()
    if (!rootPath || !file?.path || !viewState) return
    const nextState = updateWorkspaceDocumentView({
      state: workspaceDocumentsRef.current,
      rootPath,
      filePath: file.path,
      viewState,
      updatedAt: new Date().toISOString(),
      caseInsensitive: window.desktopAPI?.platform === 'win32',
    })
    if (nextState === workspaceDocumentsRef.current) return
    workspaceDocumentsRef.current = nextState
    setWorkspaceDocuments(nextState)
  }, [editorRef, openFilesRef, setWorkspaceDocuments, workspaceDocumentsRef, workspacePathRef])

  /** 内容替换完成后恢复目标文档的选区与滚动位置。 */
  const restoreWorkspaceDocumentView = useCallback((fileId: string, tries = 0) => {
    if (activeFileIdRef.current !== fileId) return
    if (!editorRef.current?.isReady()) {
      if (tries < 50) {
        setTimeout(() => restoreWorkspaceDocumentView(fileId, tries + 1), 100)
      }
      return
    }
    const rootPath = workspacePathRef.current
    const file = openFilesRef.current.find((candidate) => candidate.id === fileId)
    if (!rootPath || !file?.path) return
    const relativePath = toWorkspaceRelativePath(
      rootPath,
      file.path,
      window.desktopAPI?.platform === 'win32',
    )
    if (!relativePath) return
    const viewState = workspaceDocumentsRef.current.documents[relativePath]
    if (!viewState) return
    editorRef.current.restoreViewState(viewState)
  }, [activeFileIdRef, editorRef, openFilesRef, workspaceDocumentsRef, workspacePathRef])

  const switchFile = useCallback(
    (id: string) => {
      // 全程读 ref 镜像而非闭包 state：本回调会被更早渲染的闭包调用
      //（删除文件后的相邻标签切换、打开文件夹恢复、慢速磁盘上的重复点击等
      // 异步流程），闭包里的 openFiles/contents 可能已过期——过期守卫会
      // 放行已关闭的标签或把旧内容写进编辑器
      if (id === activeFileIdRef.current) return
      latestWorkspaceSelectionRef.current = ''
      // 防御：目标不在打开列表中不切换，避免激活文件悬空的幽灵状态
      if (!openFilesRef.current.some((f) => f.id === id)) return
      captureWorkspaceDocumentView(activeFileIdRef.current)
      // 切换前把当前文档实时内容落账（防抖窗口内的最近输入不能丢）
      flushEditorContent()
      // 先让标题输入框失焦：确保标题编辑保存到旧文件，不会串到新文件
      titleRef.current?.blur()
      // 先同步 ref，再替换内容（replaceAll 会同步触发 onChange）
      activeFileIdRef.current = id
      setActiveFileId(id)
      const file = openFilesRef.current.find((f) => f.id === id)
      setDocTitle(file?.name ?? '未命名文档')
      // 切换编辑器内容（保持同一编辑器实例，避免重建丢光标历史）
      // 渲染前把相对路径图片解析为 mdimg 协议；contentsRef 为最新落账内容
      replaceEditorContent(id, contentsRef.current[id] ?? '')
      restoreWorkspaceDocumentView(id)
      focusEditorSoon()
    },
    [
      activeFileIdRef,
      captureWorkspaceDocumentView,
      contentsRef,
      focusEditorSoon,
      flushEditorContent,
      latestWorkspaceSelectionRef,
      openFilesRef,
      replaceEditorContent,
      restoreWorkspaceDocumentView,
      setActiveFileId,
      setDocTitle,
      titleRef,
    ],
  )

  const handleNew = useCallback(() => {
    // 慢速盘上先前点击文件的读取可能在途中，作废其"最新选择"资格，
    // 否则迟到回调会抢占激活、顶掉刚创建的未命名文档（switchFile/handleOpen 同款守卫）
    latestWorkspaceSelectionRef.current = ''
    flushEditorContent()
    titleRef.current?.blur()
    const { id, name } = nextUntitled()
    const file = { id, name }
    openFilesRef.current = [...openFilesRef.current, file]
    setOpenFiles((prev) => [...prev, file])
    setContents((prev) => ({ ...prev, [id]: '' }))
    setSavedMap((prev) => ({ ...prev, [id]: true }))
    INITIAL_OR_SAVED.current[id] = ''
    activeFileIdRef.current = id
    setActiveFileId(id)
    setDocTitle(name)
    replaceEditorContent(id, '', 'initialize')
    focusEditorSoon()
  }, [INITIAL_OR_SAVED, activeFileIdRef, focusEditorSoon, flushEditorContent, latestWorkspaceSelectionRef, openFilesRef, replaceEditorContent, setActiveFileId, setContents, setDocTitle, setOpenFiles, setSavedMap, titleRef])

  /**
   * 点击左侧文件夹树中的样例文件：已打开则切换，未打开则打开为新标签页。
   * 启动时只预开「欢迎」一篇，其余样例文件通过此函数按需打开，
   * 标签页统一只在编辑器区域呈现。
   */
  const handleSelectDemoFile = useCallback(
    (id: string, pinned = true) => {
      if (!DEMO_FILES[id]) return
      const existed = openFiles.find((file) => file.id === id)
      if (existed) {
        if (pinned && existed.preview) {
          pinPreviewTab(id)
        }
        switchFile(id)
        return
      }
      const name = DEMO_FILES[id].name
      const content = DEMO_FILES[id].content
      if (!pinned) discardPreviewTab(id)
      flushEditorContent()
      const file = { id, name, preview: !pinned }
      openFilesRef.current = [...openFilesRef.current, file]
      activeFileIdRef.current = id
      setOpenFiles((prev) => [...prev, file])
      setContents((prev) => ({ ...prev, [id]: content }))
      setSavedMap((prev) => ({ ...prev, [id]: true }))
      INITIAL_OR_SAVED.current[id] = content
      setActiveFileId(id)
      setDocTitle(name)
      replaceEditorContent(id, content, 'initialize')
      focusEditorSoon()
    },
    [INITIAL_OR_SAVED, activeFileIdRef, discardPreviewTab, flushEditorContent, focusEditorSoon, openFiles, openFilesRef, pinPreviewTab, replaceEditorContent, setActiveFileId, setContents, setDocTitle, setOpenFiles, setSavedMap, switchFile],
  )

  const handleOpen = useCallback(async () => {
    if (!window.desktopAPI) return
    latestWorkspaceSelectionRef.current = ''
    const result = await window.desktopAPI.document.open()
    if (!result.ok || !result.data) {
      if (result.error?.code === 'TOO_LARGE') {
        setToast(result.error.message ?? 'Markdown 文件超过 20MB，无法打开')
      } else if (result.error?.code !== 'CANCELLED') {
        setToast('文件打开失败')
      }
      return
    }
    // 打开新文件前先落账当前文档（防抖窗口内的最近输入不能丢）
    flushEditorContent()
    titleRef.current?.blur()
    const { path, name, content } = result.data
    if (result.data.encoding) {
      setEncodingMap((prev) => ({ ...prev, [`file-${path}`]: result.data!.encoding! }))
    }
    // 已打开则直接切换（win32 大小写不同的路径是同一文件，复用已有标签）
    const existed = openFiles.find((f) => sameFilePath(f.path, path))
    if (existed) {
      if (existed.preview) {
        pinPreviewTab(existed.id)
      }
      switchFile(existed.id)
      return
    }
    const id = `file-${path}`
    const file = { id, name, path }
    openFilesRef.current = [...openFilesRef.current, file]
    setOpenFiles((prev) => [...prev, file])
    setContents((prev) => ({ ...prev, [id]: content }))
    setSavedMap((prev) => ({ ...prev, [id]: true }))
    INITIAL_OR_SAVED.current[id] = content
    setFileMtime((prev) => ({ ...prev, [id]: result.data!.modifiedTime }))
    activeFileIdRef.current = id
    setActiveFileId(id)
    setDocTitle(name)
    recordRecent(path, name)
    replaceEditorContent(id, content, 'initialize')
    focusEditorSoon()
  }, [INITIAL_OR_SAVED, activeFileIdRef, flushEditorContent, focusEditorSoon, latestWorkspaceSelectionRef, openFiles, openFilesRef, pinPreviewTab, recordRecent, replaceEditorContent, setActiveFileId, setContents, setDocTitle, setEncodingMap, setFileMtime, setOpenFiles, setSavedMap, setToast, switchFile, titleRef])

  /** 点击工作区/外部磁盘文件：首次打开时读盘，之后直接切换；返回是否成功（工作区搜索带入等场景需感知失败） */
  const handleSelectWorkspaceFile = useCallback(
    async (path: string, pinned = true): Promise<boolean> => {
      latestWorkspaceSelectionRef.current = path
      const id = `file-${path}`
      // win32 大小写不同的路径是同一文件：复用已有标签（id 以其记录为准），
      // 否则 d:\A.md 与 D:\a.md 打开成两个标签，保存时互相覆盖
      const existed = openFilesRef.current.find((file) => sameFilePath(file.path, path))
      if (existed) {
        if (pinned && existed.preview) {
          pinPreviewTab(existed.id)
        }
        switchFile(existed.id)
        return true
      }
      if (!window.desktopAPI) return false
      const opening = openingWorkspaceFilesRef.current.get(path)
      if (opening) {
        const opened = await opening
        if (opened && pinned) pinPreviewTab(id)
        // 迟到返回的调用方（双击/重复点击）：首个请求完成时若最新选择仍是本文件，
        // 补齐"切到该标签"——此前该分支只 pin 不切换，慢速读取（网络盘）时
        // 双击会表现为"点了没反应"
        if (opened && latestWorkspaceSelectionRef.current === path) {
          const nowOpen = openFilesRef.current.find((f) => f.id === id)
          if (nowOpen) switchFile(id)
        }
        return opened
      }
      const openRequest = (async (): Promise<boolean> => {
        const result = await window.desktopAPI!.document.read(path)
        if (!result.ok || !result.data) {
          if (result.error?.code === 'TOO_LARGE') {
            setToast(result.error.message ?? 'Markdown 文件超过 20MB，无法打开')
          } else if (result.error?.code === 'NOT_AUTHORIZED') {
            setToast(result.error.message ?? '文件未授权，请通过打开对话框或工作区重新打开')
          } else {
            setToast('文件读取失败')
          }
          return false
        }
        // 异步读取期间用户可能已切换/选择其它文件：迟到时仍打开为标签，
        // 但不激活（不抢当前文档焦点、不顶掉编辑器内容）——慢速盘（网络
        // 盘）上"点过的文件读完后悄悄消失"体验极差；改为标签可见，
        // 用户点一下即可查看已缓存内容
        const isLatest = latestWorkspaceSelectionRef.current === path
        // 异步读取期间，其他入口可能已先打开同一文件；此时复用已有标签
        //（大小写不同的路径同样视为同一文件）。
        const openedMeanwhile = openFilesRef.current.find((file) => sameFilePath(file.path, path))
        if (openedMeanwhile) {
          if (pinned && openedMeanwhile.preview) pinPreviewTab(openedMeanwhile.id)
          return isLatest
        }
        // 激活切换才需要先落账当前文档并收焦点；迟到打开不动当前文档
        if (isLatest) {
          flushEditorContent()
          titleRef.current?.blur()
        }
        const { name, content } = result.data
        if (result.data.encoding) {
          setEncodingMap((prev) => ({ ...prev, [id]: result.data!.encoding! }))
        }
        if (!pinned) discardPreviewTab(id)
        const file = { id, name, path, preview: !pinned }
        openFilesRef.current = [...openFilesRef.current, file]
        setOpenFiles((prev) => [...prev, file])
        setContents((prev) => ({ ...prev, [id]: content }))
        setSavedMap((prev) => ({ ...prev, [id]: true }))
        INITIAL_OR_SAVED.current[id] = content
        setFileMtime((prev) => ({ ...prev, [id]: result.data!.modifiedTime }))
        recordRecent(path, name)
        if (isLatest) {
          activeFileIdRef.current = id
          setActiveFileId(id)
          setDocTitle(name)
          replaceEditorContent(id, content, 'initialize')
          focusEditorSoon()
        }
        return isLatest
      })()
      openingWorkspaceFilesRef.current.set(path, openRequest)
      try {
        return await openRequest
      } finally {
        if (openingWorkspaceFilesRef.current.get(path) === openRequest) {
          openingWorkspaceFilesRef.current.delete(path)
        }
      }
    },
    [INITIAL_OR_SAVED, activeFileIdRef, discardPreviewTab, flushEditorContent, focusEditorSoon, latestWorkspaceSelectionRef, openFilesRef, openingWorkspaceFilesRef, pinPreviewTab, recordRecent, replaceEditorContent, setActiveFileId, setContents, setDocTitle, setEncodingMap, setFileMtime, setOpenFiles, setSavedMap, setToast, switchFile, titleRef],
  )

  const removeClosedTabs = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    const targets = new Set(ids)
    const closingActive = targets.has(activeFileIdRef.current)
    const nextOpenFiles = openFilesRef.current.filter((file) => !targets.has(file.id))
    openFilesRef.current = nextOpenFiles
    setOpenFiles(nextOpenFiles)
    setContents((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      contentsRef.current = next
      return next
    })
    setSavedMap((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
    setFileMtime((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
    setEncodingMap((prev) => {
      const next = { ...prev }
      for (const id of ids) delete next[id]
      return next
    })
    for (const id of ids) {
      saveQueueRef.current?.cancel(id)
      delete INITIAL_OR_SAVED.current[id]
      if (draftPendingRef.current?.id === id) draftPendingRef.current = null
      void clearDraft(id)
    }
    if (!closingActive) return
    const nextActive = nextOpenFiles[0]
    if (!nextActive) {
      // 全部标签关闭：活动文档回退默认未命名语义，清空编辑器与标题，
      // 避免 activeFileId 悬空指向已删除的标签（标题栏残留旧名、
      // 状态栏读取已删除键等幽灵状态）；StartScreen 由 openFiles 控制显示
      activeFileIdRef.current = DEFAULT_FILE_ID
      setActiveFileId(DEFAULT_FILE_ID)
      setDocTitle('未命名文档')
      replaceEditorContent(DEFAULT_FILE_ID, '')
      return
    }
    activeFileIdRef.current = nextActive.id
    setActiveFileId(nextActive.id)
    setDocTitle(nextActive.name)
    replaceEditorContent(nextActive.id, contentsRef.current[nextActive.id] ?? '')
  }, [INITIAL_OR_SAVED, activeFileIdRef, clearDraft, contentsRef, draftPendingRef, openFilesRef, replaceEditorContent, saveQueueRef, setActiveFileId, setContents, setDocTitle, setEncodingMap, setFileMtime, setOpenFiles, setSavedMap])

  const saveAllBeforeWindowClose = useCallback(async (): Promise<boolean> => {
    captureWorkspaceDocumentView(activeFileIdRef.current)
    flushEditorContent()
    for (const file of openFilesRef.current) {
      if (!await saveBeforeClose(file.id)) return false
      if (!file.path) removeClosedTabs([file.id])
    }
    await saveQueueRef.current?.flushAll()
    // A1：主进程关窗走 destroy()，不触发 beforeunload——防抖中的
    // 写作统计/最近文件等设置必须在此立即写回，否则丢失最后 10s/2s 的更新
    flushPersistedSettings()
    if (workspacePathRef.current && window.desktopAPI) {
      const result = await window.desktopAPI.workspaceState.saveDocuments(
        workspaceDocumentsRef.current,
      )
      if (!result.ok) setToast('文档视图状态保存失败')
    }
    return true
  }, [
    activeFileIdRef,
    captureWorkspaceDocumentView,
    flushEditorContent,
    openFilesRef,
    removeClosedTabs,
    saveBeforeClose,
    saveQueueRef,
    setToast,
    workspaceDocumentsRef,
    workspacePathRef,
  ])

  useEffect(() => {
    const currentWindow = window as unknown as {
      __markdownsoft_saveAll?: () => Promise<boolean>
    }
    currentWindow.__markdownsoft_saveAll = saveAllBeforeWindowClose
    return () => {
      delete currentWindow.__markdownsoft_saveAll
    }
  }, [saveAllBeforeWindowClose])

  /** 关闭标签页：磁盘文件先保存，未命名文档先另存为；失败或取消时保留标签。 */
  const handleCloseTab = useCallback(
    async (id: string): Promise<void> => {
      if (id === activeFileIdRef.current) flushEditorContent()
      if (!await saveBeforeClose(id)) return
      removeClosedTabs([id])
    },
    [activeFileIdRef, flushEditorContent, removeClosedTabs, saveBeforeClose],
  )

  /**
   * 批量关闭标签页（右键菜单"关闭其他/关闭全部"共用）。
   * 目标含活动文档时先落账（防抖窗口内的最后输入不丢，与单标签关闭一致）；
   * 每个标签保存成功后立即关闭；后续未命名文档若取消另存为，只保留尚未处理的标签。
   */
  const closeTabsBatch = useCallback(
    async (ids: string[]): Promise<void> => {
      if (ids.length === 0) return
      const targets = new Set(ids)
      const closingActive = targets.has(activeFileIdRef.current)
      if (closingActive) flushEditorContent()
      for (const id of ids) {
        if (!await saveBeforeClose(id)) return
        removeClosedTabs([id])
      }
    },
    [activeFileIdRef, flushEditorContent, removeClosedTabs, saveBeforeClose],
  )

  /** 右键菜单"关闭其他标签页"：保留当前激活标签，其余全部关闭 */
  const handleCloseOtherTabs = useCallback((targetId: string) => {
    closeTabsBatch(getClosableTabIds(openFilesRef.current, 'others', targetId))
  }, [closeTabsBatch, openFilesRef])

  /** 右键菜单"关闭全部标签页"：全部关闭，进入开始界面（不弹窗口关闭确认） */
  const handleCloseAllTabs = useCallback(() => {
    closeTabsBatch(getClosableTabIds(openFilesRef.current, 'all', null))
  }, [closeTabsBatch, openFilesRef])

  const handleTogglePinnedTab = useCallback((id: string) => {
    const nextOpenFiles = togglePinnedTab(openFilesRef.current, id)
    if (nextOpenFiles === openFilesRef.current) return
    openFilesRef.current = nextOpenFiles
    setOpenFiles(nextOpenFiles)
  }, [openFilesRef, setOpenFiles])

  /** 拖拽重排标签页顺序 */
  const handleReorderTabs = useCallback((from: number, to: number) => {
    const nextOpenFiles = reorderTabsWithinGroup(openFilesRef.current, from, to)
    if (nextOpenFiles === openFilesRef.current) return
    openFilesRef.current = nextOpenFiles
    setOpenFiles(nextOpenFiles)
  }, [openFilesRef, setOpenFiles])

  return {
    discardPreviewTab,
    switchFile,
    handleNew,
    handleSelectDemoFile,
    handleOpen,
    handleSelectWorkspaceFile,
    captureWorkspaceDocumentView,
    restoreWorkspaceDocumentView,
    removeClosedTabs,
    saveAllBeforeWindowClose,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    handleTogglePinnedTab,
    handleReorderTabs,
  }
}
